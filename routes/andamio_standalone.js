const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { conciliarPendientes } = require('./poller_mercadopago');

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
    const { monto, nro_operacion } = req.body;
    if (!monto || monto <= 0) return res.status(400).json({ error: 'Importe inválido' });

    const { rows } = await pool.query(
      `INSERT INTO comprobantes_transferencia
         (sucursal_id, monto, fecha_hora, nro_operacion, cargado_por, estado)
       VALUES ($1,$2,now(),$3,'Apartado urgente','pendiente')
       RETURNING *`,
      [SUCURSAL_ID_ANDAMIO, monto, nro_operacion || null]
    );

    await conciliarPendientes();
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

module.exports = router;
