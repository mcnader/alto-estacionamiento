/**
 * routes/comprobantes.js
 *
 * CRUD simple de comprobantes cargados por el operario, ligado a la
 * sucursal del usuario logueado (req.session.user.sucursal_id).
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// Crear un comprobante nuevo
router.post('/comprobantes', async (req, res) => {
  try {
    const pool = getDb();
    const sucursal_id = req.session.user.sucursal_id;
    const { monto, nro_operacion, fecha_hora } = req.body;

    if (!monto || monto <= 0) {
      return res.status(400).json({ error: 'Importe inválido' });
    }

    const { rows } = await pool.query(
      `INSERT INTO comprobantes_transferencia
         (sucursal_id, monto, fecha_hora, nro_operacion, cargado_por, estado)
       VALUES ($1,$2,$3,$4,$5,'pendiente')
       RETURNING *`,
      [
        sucursal_id,
        monto,
        fecha_hora || new Date().toISOString(),
        nro_operacion || null,
        req.session.user.nombre || req.session.user.usuario,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('Error creando comprobante:', err);
    res.status(500).json({ error: 'Error al guardar el comprobante' });
  }
});

// Listar los últimos comprobantes de la sucursal
router.get('/comprobantes', async (req, res) => {
  try {
    const pool = getDb();
    const sucursal_id = req.session.user.sucursal_id;
    const { rows } = await pool.query(
      `SELECT * FROM comprobantes_transferencia
       WHERE sucursal_id=$1
       ORDER BY created_at DESC
       LIMIT 50`,
      [sucursal_id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error listando comprobantes:', err);
    res.status(500).json({ error: 'Error al listar comprobantes' });
  }
});

module.exports = router;
