/**
 * routes/poller_mercadopago.js
 *
 * Dos formas de chequear pagos entrantes de El Andamio:
 *   1. Automático: corre cada 1 minuto en segundo plano.
 *   2. Manual: GET /api/mercadopago/verificar/andamio dispara un chequeo
 *      inmediato (para un botón "Verificar ahora" en el frontend).
 *
 * Se registra en server.js con:
 *   const pollerMP = require('./routes/poller_mercadopago');
 *   app.use('/api', pollerMP.router);
 *   pollerMP.iniciar();
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

const MP_ACCESS_TOKEN_ANDAMIO = process.env.MP_ACCESS_TOKEN_ANDAMIO;
const SUCURSAL_ID_ANDAMIO = 3;
const VENTANA_MINUTOS = 15;
const INTERVALO_MS = 1 * 60 * 1000; // 1 minuto

async function buscarPagosRecientes() {
  const desde = new Date(Date.now() - 20 * 60 * 1000).toISOString();

  const url = new URL('https://api.mercadopago.com/v1/payments/search');
  url.searchParams.set('sort', 'date_created');
  url.searchParams.set('criteria', 'desc');
  url.searchParams.set('range', 'date_created');
  url.searchParams.set('begin_date', desde);
  url.searchParams.set('end_date', new Date().toISOString());
  url.searchParams.set('status', 'approved');

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN_ANDAMIO}` },
  });
  if (!resp.ok) throw new Error(`Error consultando pagos: ${resp.status}`);
  const data = await resp.json();
  return data.results || [];
}

async function guardarMovimiento(pago) {
  const pool = getDb();
  const { rows } = await pool.query(
    `INSERT INTO movimientos_bancarios
       (sucursal_id, banco, monto, fecha_hora, nro_transaccion, remitente, origen_archivo)
     VALUES ($1,'mercadopago',$2,$3,$4,$5,'polling_mp')
     ON CONFLICT (banco, nro_transaccion) DO NOTHING
     RETURNING id`,
    [
      SUCURSAL_ID_ANDAMIO,
      pago.transaction_amount,
      pago.date_approved,
      String(pago.id),
      pago.payer?.first_name ? `${pago.payer.first_name} ${pago.payer.last_name ?? ''}`.trim() : null,
    ]
  );
  return rows.length > 0; // true si era nuevo (false si ya existía)
}

async function conciliarPendientes() {
  const pool = getDb();
  const { rows: pendientes } = await pool.query(
    `SELECT * FROM comprobantes_transferencia WHERE sucursal_id=$1 AND estado='pendiente'`,
    [SUCURSAL_ID_ANDAMIO]
  );

  for (const comprobante of pendientes) {
    if (comprobante.nro_operacion) {
      const { rows: exactos } = await pool.query(
        `SELECT * FROM movimientos_bancarios WHERE sucursal_id=$1 AND nro_transaccion=$2 AND usado=false LIMIT 1`,
        [SUCURSAL_ID_ANDAMIO, comprobante.nro_operacion]
      );
      if (exactos.length) { await marcarVerificado(comprobante.id, exactos[0].id); continue; }
    }

    const { rows: candidatos } = await pool.query(
      `SELECT * FROM movimientos_bancarios
       WHERE sucursal_id=$1 AND monto=$2 AND usado=false
         AND fecha_hora BETWEEN $3::timestamptz - ($4 || ' minutes')::interval
                             AND $3::timestamptz + ($4 || ' minutes')::interval`,
      [SUCURSAL_ID_ANDAMIO, comprobante.monto, comprobante.fecha_hora, VENTANA_MINUTOS]
    );

    if (candidatos.length === 1) await marcarVerificado(comprobante.id, candidatos[0].id);
    else if (candidatos.length === 0) await pool.query(`UPDATE comprobantes_transferencia SET estado='sin_matchear' WHERE id=$1`, [comprobante.id]);
    else await pool.query(`UPDATE comprobantes_transferencia SET estado='revisar_manual' WHERE id=$1`, [comprobante.id]);
  }
}

async function marcarVerificado(comprobanteId, movimientoId) {
  const pool = getDb();
  await pool.query(`UPDATE movimientos_bancarios SET usado=true WHERE id=$1`, [movimientoId]);
  await pool.query(`UPDATE comprobantes_transferencia SET estado='verificado', movimiento_id=$1 WHERE id=$2`, [movimientoId, comprobanteId]);
}

async function ejecutarCicloPolling() {
  const pagos = await buscarPagosRecientes();
  let nuevos = 0;
  for (const pago of pagos) {
    if (await guardarMovimiento(pago)) nuevos++;
  }
 await conciliarPendientes();
  return { totalEncontrados: pagos.length, nuevos };
}

// --- Endpoint manual: GET /api/mercadopago/verificar/andamio ---
router.get('/mercadopago/verificar/andamio', async (req, res) => {
  try {
    const resultado = await ejecutarCicloPolling();
    res.json({ ok: true, ...resultado });
  } catch (err) {
    console.error('[MP verificar manual] Error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

function iniciar() {
  if (!MP_ACCESS_TOKEN_ANDAMIO) {
    console.warn('[MP polling] MP_ACCESS_TOKEN_ANDAMIO no configurado, polling desactivado');
    return;
  }
  console.log('[MP polling] Iniciado, corre cada 1 minuto');
  ejecutarCicloPolling().catch(err => console.error('[MP polling] Error:', err.message));
  setInterval(() => {
    ejecutarCicloPolling().catch(err => console.error('[MP polling] Error:', err.message));
  }, INTERVALO_MS);
}

module.exports = { router, iniciar };
