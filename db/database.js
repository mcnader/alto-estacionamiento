const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = new Database(path.join(__dirname, 'alto.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sucursales (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, direccion TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
    CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, sucursal_id INTEGER NOT NULL, nombre TEXT NOT NULL, usuario TEXT NOT NULL UNIQUE, password TEXT NOT NULL, rol TEXT DEFAULT 'encargado', turno TEXT, activo INTEGER DEFAULT 1);
    CREATE TABLE IF NOT EXISTS tarifas (id INTEGER PRIMARY KEY AUTOINCREMENT, sucursal_id INTEGER NOT NULL, modalidad_id TEXT NOT NULL, modalidad_nombre TEXT NOT NULL, horario TEXT, vehiculo_id TEXT NOT NULL, vehiculo_label TEXT NOT NULL, tramo INTEGER NOT NULL, tramo_label TEXT NOT NULL, precio INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, sucursal_id INTEGER NOT NULL, nombre TEXT NOT NULL, dni TEXT, cel TEXT, tel TEXT, tel_ref_parentesco TEXT, dom TEXT, trabajo TEXT, modalidad TEXT NOT NULL, vehiculo1_tipo TEXT, vehiculo1_marca TEXT, vehiculo1_modelo TEXT, vehiculo1_color TEXT, vehiculo1_patente TEXT, vehiculo2_tipo TEXT, vehiculo2_marca TEXT, vehiculo2_modelo TEXT, vehiculo2_color TEXT, vehiculo2_patente TEXT, obs TEXT, ingreso TEXT, activo INTEGER DEFAULT 1, fecha_baja TEXT);
    CREATE TABLE IF NOT EXISTS pagos (id INTEGER PRIMARY KEY AUTOINCREMENT, sucursal_id INTEGER NOT NULL, cliente_id INTEGER NOT NULL, fecha TEXT NOT NULL, mes TEXT NOT NULL, importe_esperado INTEGER DEFAULT 0, importe_abonado INTEGER DEFAULT 0, forma_pago TEXT DEFAULT 'efectivo', encargado_id INTEGER, obs TEXT, anulado INTEGER DEFAULT 0, anulado_motivo TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
  `);
  const c = db.prepare('SELECT COUNT(*) as n FROM sucursales').get();
  if (c.n === 0) seed();
}

function seed() {
  const s = db.prepare('INSERT INTO sucursales (nombre,direccion) VALUES (?,?)').run('Alto E — Principal','Tucumán');
  const sid = s.lastInsertRowid;
  db.prepare('INSERT INTO usuarios (sucursal_id,nombre,usuario,password,rol,turno) VALUES (?,?,?,?,?,?)').run(sid,'Administrador','admin',bcrypt.hashSync('admin123',10),'admin','');
  db.prepare('INSERT INTO usuarios (sucursal_id,nombre,usuario,password,rol,turno) VALUES (?,?,?,?,?,?)').run(sid,'Encargado 1','enc1',bcrypt.hashSync('enc123',10),'encargado','Mañana');
  const mods=[{id:'mensual',n:'Mensual',h:'L a V 07-22 · Sáb 08-15'},{id:'turno1',n:'Turno 1',h:'07 a 14 hs'},{id:'turno2',n:'Turno 2',h:'14 a 22 hs'},{id:'nocturno',n:'Nocturno',h:'20 a 08 hs'}];
  const vehs=[{id:'moto',l:'Moto'},{id:'auto',l:'Auto'},{id:'camioneta',l:'Camioneta'},{id:'trafic',l:'Trafic'},{id:'trafic_larga',l:'Trafic larga'}];
  const precios={mensual:{moto:[25000,30000,35000],auto:[90000,95000,100000],camioneta:[100000,105000,110000],trafic:[0,0,0],trafic_larga:[0,0,0]},turno1:{moto:[20000,25000,30000],auto:[75000,80000,85000],camioneta:[90000,95000,100000],trafic:[120000,125000,130000],trafic_larga:[0,0,0]},turno2:{moto:[20000,25000,30000],auto:[75000,80000,85000],camioneta:[90000,95000,100000],trafic:[120000,125000,130000],trafic_larga:[0,0,0]},nocturno:{moto:[60000,65000,70000],auto:[75000,80000,85000],camioneta:[90000,95000,100000],trafic:[120000,125000,130000],trafic_larga:[0,0,0]}};
  const tramos=['1 al 10','11 al 20','21 al 31'];
  const st=db.prepare('INSERT INTO tarifas (sucursal_id,modalidad_id,modalidad_nombre,horario,vehiculo_id,vehiculo_label,tramo,tramo_label,precio) VALUES (?,?,?,?,?,?,?,?,?)');
  for(const m of mods) for(const v of vehs) for(let t=0;t<3;t++) st.run(sid,m.id,m.n,m.h,v.id,v.l,t,tramos[t],(precios[m.id]?.[v.id]?.[t])||0);
  const sc=db.prepare(`INSERT INTO clientes (sucursal_id,nombre,cel,tel,tel_ref_parentesco,dom,trabajo,modalidad,vehiculo1_tipo,vehiculo1_marca,vehiculo1_modelo,vehiculo1_color,vehiculo1_patente,activo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)`);
  const cls=[[sid,'Díaz Roxana Mariel','','','','Av. Perón 1800 YB','Osprera','turno1','auto','Jeep','Sport','Blanco','AB 706 DJ'],[sid,'Gomez Bonano Cecilia','381-5399240','','','Venezuela 4039','','turno1','auto','Fiat','Palio','Rojo','AA 505 UT'],[sid,'Leoni María del Pilar','381-5326215','','','Los Ceibos 579 YB','R. Adopc','turno1','auto','Volkswagen','Polo','Gris','AC 559 LS'],[sid,'Lobo Juan Pablo','381-6645318','','','Bvd 9 julio 1906','Maipú 70','turno1','moto','Mondial','Racer 150','Negro','A078 YWF'],[sid,'Yafar Lucía','','','','Juan L Nougués 123','P Jud','turno1','auto','Fiat','Cronos','Gris','AH 088 WQ'],[sid,'Alonso César','385-947048','','','','','mensual','auto','Chevrolet','Tracker','Blanco','AF 368 MP'],[sid,'Ciolli María Laura','381-5348011','4979716','','Country Los Azahares','','mensual','auto','Citroen','C3','Blanco','AB 802 NG'],[sid,'Díaz Denise Belén','381-3041235','381-5945859','','Magallanes 450','E Jurídico','mensual','auto','Volkswagen','Gol Trend','Negro','JSZ 818'],[sid,'Ferrari Germán','381-5499401','','','Malabia 2840','UATRE','mensual','camioneta','Toyota/Ford','Corolla/Ranger','Blanco','AA 851FN'],[sid,'Gimenez Alvaro','387-6661862','','','Alto Verde III','Ruiz auto','mensual','auto','Toyota','Corolla','Rojo','AE 693 ER'],[sid,'Miguel Silvina','381-4090700','','','Country Nvo Golf','R. Adopc','mensual','auto','Jeep','Sport','Blanco','AE 050 MM'],[sid,'Navarro Flavia','381-3645246','381-5233000','','Santiago 1347','S.Martín 666','mensual','auto','Toyota','Yaris','Gris','AE751 BS'],[sid,'Navarro María Cecilia','381-6284564','','','Santiago 4491','','mensual','auto','Ford','KA','Blanco','AB 055 FF'],[sid,'Pastorino César','381-5607076','','','Country Marcos Paz','P Jud','mensual','camioneta','Volkswagen','Amarok','','AD 652 XE'],[sid,'Quiroga José Fabián','383-4525899','383-4529018','','Bs As 71 14 A','Batistella','mensual','auto','Fiat','Uno','Gris','MEV 611'],[sid,'Riso Patrón Salustiano','381-5126136','','','Chacabuco 34 7 B','','mensual','auto','Volkswagen','Golf','Azul','AA 889 KH'],[sid,'Rodriguez Marat M Gabriela','381-4129000','381-5093174','','Honduras 760 YB','UNSTA','mensual','auto','Toyota','T-Cross','Blanco','AF545DX'],[sid,'Thames Augusto','381-5344727','','','Crisóstomo Alvarez 617','Cmo 617','mensual','camioneta','Volkswagen','Amarok','Blanco','AE 991 HC'],[sid,'Vazquez María Constanza','381-5587662','381-6456639','','Av Perón 1000 YB','SIPROSA','mensual','auto','Peugeot','208','Gris','PPX 664'],[sid,'Villalba Celeste','381-4024675','','','24 de Septiembre 547','','mensual','auto','Fiat','Cronos','Blanco','AD 386 XQ']];
  for(const c of cls) sc.run(...c);
}

module.exports = { getDb: ()=>db, initDb };
