const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'estacionamiento.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS sucursales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  direccion TEXT,
  telefono TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK(rol IN ('admin','encargado')),
  sucursal_id INTEGER,
  activo INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tarifas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sucursal_id INTEGER NOT NULL,
  tipo_vehiculo TEXT NOT NULL,
  hora REAL DEFAULT 0,
  dia REAL DEFAULT 0,
  mes REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  telefono TEXT,
  email TEXT,
  patente TEXT,
  vehiculo TEXT,
  tarifa_id INTEGER,
  sucursal_id INTEGER,
  saldo REAL DEFAULT 0,
  activo INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tarifa_id) REFERENCES tarifas(id) ON DELETE SET NULL,
  FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  sucursal_id INTEGER,
  usuario_id INTEGER,
  monto REAL NOT NULL,
  concepto TEXT,
  metodo TEXT DEFAULT 'efectivo',
  fecha DATE DEFAULT (date('now')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
  FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE SET NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
);
`);

const adminCount = db.prepare("SELECT COUNT(*) AS c FROM usuarios WHERE rol = 'admin'").get();
if (adminCount.c === 0) {
  const sucursal = db.prepare('INSERT INTO sucursales (nombre, direccion) VALUES (?, ?)')
    .run('Sucursal Central', 'Av. Principal 100');
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO usuarios (username, password, nombre, rol, sucursal_id) VALUES (?, ?, ?, ?, ?)')
    .run('admin', hash, 'Administrador', 'admin', sucursal.lastInsertRowid);
  db.prepare('INSERT INTO tarifas (sucursal_id, tipo_vehiculo, hora, dia, mes) VALUES (?, ?, ?, ?, ?)')
    .run(sucursal.lastInsertRowid, 'Auto', 500, 3000, 45000);
  db.prepare('INSERT INTO tarifas (sucursal_id, tipo_vehiculo, hora, dia, mes) VALUES (?, ?, ?, ?, ?)')
    .run(sucursal.lastInsertRowid, 'Moto', 300, 1800, 28000);
}

module.exports = db;
