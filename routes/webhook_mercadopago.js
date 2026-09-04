/**
 * routes/webhook_mercadopago.js
 *
 * Webhook para la sucursal EL ANDAMIO (piloto).
 * Usa el mismo pool de conexión (db/database.js) que el resto del sistema.
 *
 * IMPORTANTE: Mercado Pago tiene dos formatos de notificación:
 *   - Nuevo (webhooks v2): POST con JSON body { type: "payment", data: { id } }
 *   - Legacy (IPN):        POST o GET con query params ?topic=payment&id=123
 * Este handler soporta ambos, y logea cada request que entra para poder
 * diagnosticar qué está mandando MP realmente.
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

const MP_ACCESS_TOKEN_ANDAMIO = process.env.MP_ACCESS_TOKEN_ANDAMIO;
const SUCURSAL_ID_ANDAMIO = 3; // El Andamio, según tu tabla `sucursales`
const VENTANA_MINUTOS = 15;

async function manejarNotificacion(req, res) {
  res.sendStatus(200); // respondemos ya, MP reintenta si tardamos

  // --- LOG DE DIAGNÓSTICO: sacar una vez que confirmemos que anda ---
  console.log('[MP webhook] request recibido:', {
    method: req.method,
    query: req.query,
    body: req.body,
  });

  try {
    // Formato nuevo (JSON body)
    let tipo = req.body?.type;
    let paymentId = req.body?.data?.id;

    // Formato legacy (query params)
    if (!paymentId) {
      tipo = req.query?.topic || tipo;
      paymentId = req.query?.id || req.body?.resource;
    }

    if (tipo !== 'payment' || !paymentId) {
      console.log('[MP webhook] ignorado — tipo:', tipo, 'paymentId:', paymentId);
      return;
    }

    const pago = await consultarPago(paymentId, MP_ACCESS_TOKEN_ANDAMIO);
    console.log('[MP webhook] pago consultado:', pago.id, pago.status, pago.transaction_amount);

    if (pago.status !== 'approved') return;

    await guardarMovimiento({
      sucursal_id: SUCURSAL_ID_ANDAMIO,
      banco: 'mercadopago',
      monto: pago.transaction_amount,
      fecha_hora: pago.date_approved,
      nro_transaccion: String(pago.id),
      remitente: pago.payer?.first_name
        ? `${pago.payer.first_name} ${pago.payer.last_name ?? ''}`.trim()
        : null,
    });

    console.log('[MP webhook] movimiento guardado, corriendo conciliación...');
    await conciliarPendientes(SUCURSAL_ID_ANDAMIO);

  } catch (err) {
    console.error('[MP webhook] Error procesando notificación:', err);
  }
}

router.post('/webhook/mercadopago/andamio', manejarNotificacion);
router.get('/webhook/mercadopago/andamio', manejarNotificacion); // por si MP usa GET en modo legacy

async function consultarPago(paymentId, accessToken) {
  const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`Error consultando pago ${paymentId}: ${resp.status}`);
  return resp.json();
}

async function guardarMovimiento(datos) {
  const pool = getDb();
  await pool.query(
    `INSERT INTO movimientos_bancarios
       (sucursal_id, banco, monto, fecha_hora, nro_transaccion, remitente, origen_archivo)
     VALUES ($1,$2,$3,$4,$5,$6,'webhook_mp')
     ON CONFLICT (banco, nro_transaccion) DO NOTHING`,
    [datos.sucursal_id, datos.banco, datos.monto, datos.fecha_hora, datos.nro_transaccion, datos.remitente]
  );
}

async function conciliarPendientes(sucursalId) {
  const pool = getDb();

  const { rows: pendientes } = await pool.query(
    `SELECT * FROM comprobantes_transferencia WHERE sucursal_id=$1 AND estado='pendiente'`,
    [sucursalId]
  );

  for (const comprobante of pendientes) {
    if (comprobante.nro_operacion) {
      const { rows: exactos } = await pool.query(
        `SELECT * FROM movimientos_bancarios
         WHERE sucursal_id=$1 AND nro_transaccion=$2 AND usado=false LIMIT 1`,
        [sucursalId, comprobante.nro_operacion]
      );
      if (exactos.length) {
        await marcarVerificado(comprobante.id, exactos[0].id);
        continue;
      }
    }

    const { rows: candidatos } = await pool.query(
      `SELECT * FROM movimientos_bancarios
       WHERE sucursal_id=$1 AND monto=$2 AND usado=false
         AND fecha_hora BETWEEN $3::timestamptz - ($4 || ' minutes')::interval
                             AND $3::timestamptz + ($4 || ' minutes')::interval`,
      [sucursalId, comprobante.monto, comprobante.fecha_hora, VENTANA_MINUTOS]
    );

    if (candidatos.length === 1) {
      await marcarVerificado(comprobante.id, candidatos[0].id);
    } else if (candidatos.length === 0) {
      await pool.query(`UPDATE comprobantes_transferencia SET estado='sin_matchear' WHERE id=$1`, [comprobante.id]);
    } else {
      await pool.query(`UPDATE comprobantes_transferencia SET estado='revisar_manual' WHERE id=$1`, [comprobante.id]);
    }
  }
}

async function marcarVerificado(comprobanteId, movimientoId) {
  const pool = getDb();
  await pool.query(`UPDATE movimientos_bancarios SET usado=true WHERE id=$1`, [movimientoId]);
  await pool.query(
    `UPDATE comprobantes_transferencia SET estado='verificado', movimiento_id=$1 WHERE id=$2`,
    [movimientoId, comprobanteId]
  );
}

module.exports = router;
