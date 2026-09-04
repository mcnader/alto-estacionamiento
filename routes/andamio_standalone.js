const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { conciliarPendientes, ejecutarCicloPolling } = require('./poller_mercadopago');

const SUCURSAL_ID_ANDAMIO = 3;
const CLAVE = process.env.ANDAMIO_CLAVE_URGENTE || 'andamio2026';

function chequearClave(req, res, next) {
  const clave = req.headers['x-clave'] || req.query.clave;
  if (clave !== CLAVE) return res.status(401).json({ error: 'Clave incorrecta' });
  next();
}

router.post('/andamio-urgente/comprobantes', chequearClave, async (req, res) => {
  try {
    const pool = getDb();
    const { monto, nro_operacion, patente } = req.body;
    if (!monto || monto <= 0) return res.status(400).json({ error: 'Importe inválido' });

    const { rows } = await pool.query(
      `INSERT INTO comprobantes_transferencia
         (sucursal_id, monto, fecha_hora, nro_operacion, patente, cargado_por, estado)
       VALUES ($1,$2,now(),$3,$4,'Apartado urgente','pendiente')
       RETURNING *`,
      [SUCURSAL_ID_ANDAMIO, monto, nro_operacion || null, (patente || '').toUpperCase() || null]
    );

    await ejecutarCicloPolling();

    const { rows: actualizado } = await pool.query(
      `SELECT * FROM comprobantes_transferencia WHERE id=$1`, [rows[0].id]
    );
    res.json(actualizado[0]);
  } catch (err) {
    console.error('Error en comprobante urgente:', err);
    res.status(500).json({ error: 'Error al guardar' });
  }
});

router.get('/andamio-urgente/comprobantes', chequearClave, async (req, res) => {
  try {
    const pool = getDb();
    const { rows } = await pool.query(
      `SELECT * FROM comprobantes_transferencia WHERE sucursal_id=$1 ORDER BY created_at DESC LIMIT 30`,
      [SUCURSAL_ID_ANDAMIO]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al listar' });
  }
});

// --- Borrar: exige la clave otra vez en el body (no solo el header guardado) ---
// Así, aunque la clave esté guardada en el celular, hay que volver a tipearla
// a propósito para borrar algo — reduce los borrados accidentales.
router.delete('/andamio-urgente/comprobantes/:id', chequearClave, async (req, res) => {
  try {
    const { claveConfirmacion } = req.body || {};
    if (claveConfirmacion !== CLAVE) return res.status(401).json({ error: 'Clave de confirmación incorrecta' });

    const pool = getDb();
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT * FROM comprobantes_transferencia WHERE id=$1 AND sucursal_id=$2`,
      [id, SUCURSAL_ID_ANDAMIO]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });

    if (rows[0].movimiento_id) {
      await pool.query(`UPDATE movimientos_bancarios SET usado=false WHERE id=$1`, [rows[0].movimiento_id]);
    }
    await pool.query(`DELETE FROM comprobantes_transferencia WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error borrando comprobante:', err);
    res.status(500).json({ error: 'Error al borrar' });
  }
});

router.post('/andamio-urgente/comprobantes/:id/reintentar', chequearClave, async (req, res) => {
  try {
    const pool = getDb();
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT * FROM comprobantes_transferencia WHERE id=$1 AND sucursal_id=$2`,
      [id, SUCURSAL_ID_ANDAMIO]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });

    if (rows[0].movimiento_id) {
      await pool.query(`UPDATE movimientos_bancarios SET usado=false WHERE id=$1`, [rows[0].movimiento_id]);
    }
    await pool.query(
      `UPDATE comprobantes_transferencia SET estado='pendiente', movimiento_id=NULL WHERE id=$1`,
      [id]
    );

    await ejecutarCicloPolling();

    const { rows: actualizado } = await pool.query(`SELECT * FROM comprobantes_transferencia WHERE id=$1`, [id]);
    res.json(actualizado[0]);
  } catch (err) {
    console.error('Error reintentando comprobante:', err);
    res.status(500).json({ error: 'Error al reintentar' });
  }
});

router.get('/andamio-urgente/reporte', chequearClave, async (req, res) => {
  try {
    const pool = getDb();
    const { desde, hasta } = req.query;
    if (!desde || !hasta) return res.status(400).json({ error: 'Faltan fechas desde/hasta' });

    const { rows } = await pool.query(
      `SELECT * FROM comprobantes_transferencia
       WHERE sucursal_id=$1
         AND fecha_hora >= $2::date
         AND fecha_hora < ($3::date + interval '1 day')
       ORDER BY fecha_hora ASC`,
      [SUCURSAL_ID_ANDAMIO, desde, hasta]
    );

    const totales = rows.reduce((acc, c) => {
      acc.cantidad++;
      acc.total += parseFloat(c.monto);
      if (c.estado === 'verificado') { acc.verificados++; acc.totalVerificado += parseFloat(c.monto); }
      else if (c.estado === 'sin_matchear') acc.sinMatchear++;
      else if (c.estado === 'revisar_manual') acc.revisarManual++;
      else acc.pendientes++;
      return acc;
    }, { cantidad:0, total:0, verificados:0, totalVerificado:0, sinMatchear:0, revisarManual:0, pendientes:0 });

    res.json({ comprobantes: rows, totales, desde, hasta });
  } catch (err) {
    console.error('Error generando reporte:', err);
    res.status(500).json({ error: 'Error al generar el informe' });
  }
});

module.exports = router;
