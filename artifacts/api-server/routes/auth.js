const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
  }
  const user = db.prepare('SELECT * FROM usuarios WHERE username = ? AND activo = 1').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  req.session.userId = user.id;
  req.session.rol = user.rol;
  req.session.sucursal_id = user.sucursal_id;
  res.json({
    id: user.id,
    username: user.username,
    nombre: user.nombre,
    rol: user.rol,
    sucursal_id: user.sucursal_id,
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'No autenticado' });
  const user = db.prepare(`
    SELECT u.id, u.username, u.nombre, u.rol, u.sucursal_id, s.nombre AS sucursal_nombre
    FROM usuarios u LEFT JOIN sucursales s ON s.id = u.sucursal_id
    WHERE u.id = ?
  `).get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'No autenticado' });
  res.json(user);
});

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'No autenticado' });
  next();
}

function requireAdmin(req, res, next) {
  if (req.session.rol !== 'admin') return res.status(403).json({ error: 'Requiere permisos de administrador' });
  next();
}

module.exports = { router, requireAuth, requireAdmin };
