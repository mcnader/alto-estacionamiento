const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { requireAuth, requireAdmin } = require('./auth');

const router = express.Router();
router.use(requireAuth);

/* ===== Sucursales ===== */
router.get('/sucursales', (req, res) => {
  res.json(db.prepare('SELECT * FROM sucursales ORDER BY nombre').all());
});
router.post('/sucursales', requireAdmin, (req, res) => {
  const { nombre, direccion, telefono } = req.body || {};
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  const r = db.prepare('INSERT INTO sucursales (nombre, direccion, telefono) VALUES (?, ?, ?)')
    .run(nombre, direccion || null, telefono || null);
  res.json(db.prepare('SELECT * FROM sucursales WHERE id = ?').get(r.lastInsertRowid));
});
router.put('/sucursales/:id', requireAdmin, (req, res) => {
  const { nombre, direccion, telefono } = req.body || {};
  db.prepare('UPDATE sucursales SET nombre = ?, direccion = ?, telefono = ? WHERE id = ?')
    .run(nombre, direccion || null, telefono || null, req.params.id);
  res.json(db.prepare('SELECT * FROM sucursales WHERE id = ?').get(req.params.id));
});
router.delete('/sucursales/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM sucursales WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ===== Usuarios (encargados) ===== */
router.get('/usuarios', requireAdmin, (req, res) => {
  res.json(db.prepare(`
    SELECT u.id, u.username, u.nombre, u.rol, u.sucursal_id, u.activo, s.nombre AS sucursal_nombre
    FROM usuarios u LEFT JOIN sucursales s ON s.id = u.sucursal_id
    ORDER BY u.nombre
  `).all());
});
router.post('/usuarios', requireAdmin, (req, res) => {
  const { username, password, nombre, rol, sucursal_id } = req.body || {};
  if (!username || !password || !nombre || !rol) return res.status(400).json({ error: 'Campos incompletos' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const r = db.prepare('INSERT INTO usuarios (username, password, nombre, rol, sucursal_id) VALUES (?, ?, ?, ?, ?)')
      .run(username, hash, nombre, rol, sucursal_id || null);
    res.json(db.prepare('SELECT id, username, nombre, rol, sucursal_id, activo FROM usuarios WHERE id = ?').get(r.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: 'Usuario ya existe' });
  }
});
router.put('/usuarios/:id', requireAdmin, (req, res) => {
  const { nombre, rol, sucursal_id, password, activo } = req.body || {};
  const fields = [];
  const params = [];
  if (nombre !== undefined) { fields.push('nombre = ?'); params.push(nombre); }
  if (rol !== undefined) { fields.push('rol = ?'); params.push(rol); }
  if (sucursal_id !== undefined) { fields.push('sucursal_id = ?'); params.push(sucursal_id || null); }
  if (activo !== undefined) { fields.push('activo = ?'); params.push(activo ? 1 : 0); }
  if (password) { fields.push('password = ?'); params.push(bcrypt.hashSync(password, 10)); }
  if (fields.length) {
    params.push(req.params.id);
    db.prepare(`UPDATE usuarios SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  }
  res.json(db.prepare('SELECT id, username, nombre, rol, sucursal_id, activo FROM usuarios WHERE id = ?').get(req.params.id));
});
router.delete('/usuarios/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ===== Tarifas ===== */
router.get('/tarifas', (req, res) => {
  const { sucursal_id } = req.query;
  const sql = sucursal_id
    ? 'SELECT t.*, s.nombre AS sucursal_nombre FROM tarifas t LEFT JOIN sucursales s ON s.id = t.sucursal_id WHERE t.sucursal_id = ? ORDER BY t.tipo_vehiculo'
    : 'SELECT t.*, s.nombre AS sucursal_nombre FROM tarifas t LEFT JOIN sucursales s ON s.id = t.sucursal_id ORDER BY s.nombre, t.tipo_vehiculo';
  res.json(sucursal_id ? db.prepare(sql).all(sucursal_id) : db.prepare(sql).all());
});
router.post('/tarifas', requireAdmin, (req, res) => {
  const { sucursal_id, tipo_vehiculo, hora, dia, mes } = req.body || {};
  if (!sucursal_id || !tipo_vehiculo) return res.status(400).json({ error: 'Datos incompletos' });
  const r = db.prepare('INSERT INTO tarifas (sucursal_id, tipo_vehiculo, hora, dia, mes) VALUES (?, ?, ?, ?, ?)')
    .run(sucursal_id, tipo_vehiculo, +hora || 0, +dia || 0, +mes || 0);
  res.json(db.prepare('SELECT * FROM tarifas WHERE id = ?').get(r.lastInsertRowid));
});
router.put('/tarifas/:id', requireAdmin, (req, res) => {
  const { tipo_vehiculo, hora, dia, mes, sucursal_id } = req.body || {};
  db.prepare('UPDATE tarifas SET tipo_vehiculo = ?, hora = ?, dia = ?, mes = ?, sucursal_id = ? WHERE id = ?')
    .run(tipo_vehiculo, +hora || 0, +dia || 0, +mes || 0, sucursal_id, req.params.id);
  res.json(db.prepare('SELECT * FROM tarifas WHERE id = ?').get(req.params.id));
});
router.delete('/tarifas/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM tarifas WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ===== Clientes ===== */
router.get('/clientes', (req, res) => {
  const { sucursal_id, q } = req.query;
  let sql = `
    SELECT c.*, t.tipo_vehiculo, t.mes AS tarifa_mes, s.nombre AS sucursal_nombre
    FROM clientes c
    LEFT JOIN tarifas t ON t.id = c.tarifa_id
    LEFT JOIN sucursales s ON s.id = c.sucursal_id
    WHERE 1=1
  `;
  const params = [];
  if (sucursal_id) { sql += ' AND c.sucursal_id = ?'; params.push(sucursal_id); }
  if (q) {
    sql += ' AND (c.nombre LIKE ? OR c.patente LIKE ? OR c.telefono LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += ' ORDER BY c.nombre';
  res.json(db.prepare(sql).all(...params));
});
router.get('/clientes/:id', (req, res) => {
  const c = db.prepare(`
    SELECT c.*, t.tipo_vehiculo, t.mes AS tarifa_mes, s.nombre AS sucursal_nombre
    FROM clientes c
    LEFT JOIN tarifas t ON t.id = c.tarifa_id
    LEFT JOIN sucursales s ON s.id = c.sucursal_id
    WHERE c.id = ?
  `).get(req.params.id);
  if (!c) return res.status(404).json({ error: 'No encontrado' });
  res.json(c);
});
router.post('/clientes', (req, res) => {
  const { nombre, telefono, email, patente, vehiculo, tarifa_id, sucursal_id, saldo } = req.body || {};
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  const r = db.prepare(`
    INSERT INTO clientes (nombre, telefono, email, patente, vehiculo, tarifa_id, sucursal_id, saldo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(nombre, telefono || null, email || null, patente || null, vehiculo || null,
         tarifa_id || null, sucursal_id || null, +saldo || 0);
  res.json(db.prepare('SELECT * FROM clientes WHERE id = ?').get(r.lastInsertRowid));
});
router.put('/clientes/:id', (req, res) => {
  const { nombre, telefono, email, patente, vehiculo, tarifa_id, sucursal_id, activo } = req.body || {};
  db.prepare(`
    UPDATE clientes SET nombre = ?, telefono = ?, email = ?, patente = ?, vehiculo = ?,
      tarifa_id = ?, sucursal_id = ?, activo = ? WHERE id = ?
  `).run(nombre, telefono || null, email || null, patente || null, vehiculo || null,
         tarifa_id || null, sucursal_id || null, activo === undefined ? 1 : (activo ? 1 : 0), req.params.id);
  res.json(db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id));
});
router.delete('/clientes/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM clientes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ===== Pagos ===== */
router.get('/pagos', (req, res) => {
  const { sucursal_id, cliente_id, desde, hasta } = req.query;
  let sql = `
    SELECT p.*, c.nombre AS cliente_nombre, c.patente, s.nombre AS sucursal_nombre, u.nombre AS usuario_nombre
    FROM pagos p
    LEFT JOIN clientes c ON c.id = p.cliente_id
    LEFT JOIN sucursales s ON s.id = p.sucursal_id
    LEFT JOIN usuarios u ON u.id = p.usuario_id
    WHERE 1=1
  `;
  const params = [];
  if (sucursal_id) { sql += ' AND p.sucursal_id = ?'; params.push(sucursal_id); }
  if (cliente_id) { sql += ' AND p.cliente_id = ?'; params.push(cliente_id); }
  if (desde) { sql += ' AND p.fecha >= ?'; params.push(desde); }
  if (hasta) { sql += ' AND p.fecha <= ?'; params.push(hasta); }
  sql += ' ORDER BY p.fecha DESC, p.id DESC';
  res.json(db.prepare(sql).all(...params));
});
router.post('/pagos', (req, res) => {
  const { cliente_id, monto, concepto, metodo, fecha, sucursal_id } = req.body || {};
  if (!cliente_id || !monto) return res.status(400).json({ error: 'Cliente y monto requeridos' });
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(cliente_id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  const tx = db.transaction(() => {
    const r = db.prepare(`
      INSERT INTO pagos (cliente_id, sucursal_id, usuario_id, monto, concepto, metodo, fecha)
      VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, date('now')))
    `).run(cliente_id, sucursal_id || cliente.sucursal_id, req.session.userId,
           +monto, concepto || null, metodo || 'efectivo', fecha || null);
    db.prepare('UPDATE clientes SET saldo = saldo + ? WHERE id = ?').run(+monto, cliente_id);
    return r.lastInsertRowid;
  });
  const id = tx();
  res.json(db.prepare('SELECT * FROM pagos WHERE id = ?').get(id));
});
router.delete('/pagos/:id', requireAdmin, (req, res) => {
  const pago = db.prepare('SELECT * FROM pagos WHERE id = ?').get(req.params.id);
  if (!pago) return res.status(404).json({ error: 'No encontrado' });
  const tx = db.transaction(() => {
    db.prepare('UPDATE clientes SET saldo = saldo - ? WHERE id = ?').run(pago.monto, pago.cliente_id);
    db.prepare('DELETE FROM pagos WHERE id = ?').run(req.params.id);
  });
  tx();
  res.json({ ok: true });
});

/* ===== Dashboard ===== */
router.get('/dashboard', (req, res) => {
  const sucursalFilter = req.session.rol === 'admin' ? '' : ' WHERE sucursal_id = ?';
  const params = req.session.rol === 'admin' ? [] : [req.session.sucursal_id];
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';

  const totalClientes = db.prepare(`SELECT COUNT(*) AS c FROM clientes${sucursalFilter}`).get(...params).c;
  const totalSucursales = db.prepare('SELECT COUNT(*) AS c FROM sucursales').get().c;

  const ingresosHoy = db.prepare(`
    SELECT COALESCE(SUM(monto), 0) AS total FROM pagos
    WHERE fecha = ?${req.session.rol === 'admin' ? '' : ' AND sucursal_id = ?'}
  `).get(...(req.session.rol === 'admin' ? [today] : [today, req.session.sucursal_id])).total;

  const ingresosMes = db.prepare(`
    SELECT COALESCE(SUM(monto), 0) AS total FROM pagos
    WHERE fecha >= ?${req.session.rol === 'admin' ? '' : ' AND sucursal_id = ?'}
  `).get(...(req.session.rol === 'admin' ? [monthStart] : [monthStart, req.session.sucursal_id])).total;

  const saldoTotal = db.prepare(`SELECT COALESCE(SUM(saldo), 0) AS total FROM clientes${sucursalFilter}`).get(...params).total;

  const ingresosPorDia = db.prepare(`
    SELECT fecha, SUM(monto) AS total FROM pagos
    WHERE fecha >= date('now', '-13 days')${req.session.rol === 'admin' ? '' : ' AND sucursal_id = ?'}
    GROUP BY fecha ORDER BY fecha
  `).all(...(req.session.rol === 'admin' ? [] : [req.session.sucursal_id]));

  res.json({ totalClientes, totalSucursales, ingresosHoy, ingresosMes, saldoTotal, ingresosPorDia });
});

/* ===== Resumen ===== */
router.get('/resumen', (req, res) => {
  const { desde, hasta, sucursal_id } = req.query;
  const conds = [];
  const params = [];
  if (desde) { conds.push('p.fecha >= ?'); params.push(desde); }
  if (hasta) { conds.push('p.fecha <= ?'); params.push(hasta); }
  if (sucursal_id) { conds.push('p.sucursal_id = ?'); params.push(sucursal_id); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

  const porSucursal = db.prepare(`
    SELECT s.nombre AS sucursal, COUNT(p.id) AS cantidad, COALESCE(SUM(p.monto), 0) AS total
    FROM pagos p LEFT JOIN sucursales s ON s.id = p.sucursal_id
    ${where} GROUP BY p.sucursal_id ORDER BY total DESC
  `).all(...params);

  const porMetodo = db.prepare(`
    SELECT p.metodo, COUNT(p.id) AS cantidad, COALESCE(SUM(p.monto), 0) AS total
    FROM pagos p ${where} GROUP BY p.metodo ORDER BY total DESC
  `).all(...params);

  const totalGeneral = db.prepare(`
    SELECT COUNT(p.id) AS cantidad, COALESCE(SUM(p.monto), 0) AS total FROM pagos p ${where}
  `).get(...params);

  res.json({ porSucursal, porMetodo, totalGeneral });
});

/* ===== Cuenta corriente ===== */
router.get('/cuenta-corriente/:cliente_id', (req, res) => {
  const cliente = db.prepare(`
    SELECT c.*, t.tipo_vehiculo, t.mes AS tarifa_mes, s.nombre AS sucursal_nombre
    FROM clientes c LEFT JOIN tarifas t ON t.id = c.tarifa_id
    LEFT JOIN sucursales s ON s.id = c.sucursal_id WHERE c.id = ?
  `).get(req.params.cliente_id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  const movimientos = db.prepare(`
    SELECT p.*, u.nombre AS usuario_nombre
    FROM pagos p LEFT JOIN usuarios u ON u.id = p.usuario_id
    WHERE p.cliente_id = ? ORDER BY p.fecha DESC, p.id DESC
  `).all(req.params.cliente_id);
  const total = movimientos.reduce((s, m) => s + m.monto, 0);
  res.json({ cliente, movimientos, total });
});

module.exports = router;
