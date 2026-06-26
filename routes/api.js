const express=require('express');
const router=express.Router();
const bcrypt=require('bcryptjs');
const {getDb}=require('../db/database');

const auth=(req,res,next)=>{if(!req.session.user)return res.status(401).json({error:'No autenticado'});next();};
const admin=(req,res,next)=>{if(!req.session.user||req.session.user.rol!=='admin')return res.status(403).json({error:'Solo admin'});next();};
const sid=(req)=>req.session.user.sucursal_id;
const db=()=>getDb();

router.get('/sucursales',async(req,res)=>{try{const r=await db().query('SELECT * FROM sucursales ORDER BY nombre');res.json(r.rows);}catch(e){res.status(500).json({error:e.message});}});

router.post('/sucursales',admin,async(req,res)=>{try{const {nombre,direccion}=req.body;if(!nombre)return res.status(400).json({error:'Nombre requerido'});const r=await db().query('INSERT INTO sucursales (nombre,direccion) VALUES ($1,$2) RETURNING id',[nombre,direccion||'']);const newSid=r.rows[0].id;const hash=bcrypt.hashSync('admin123',10);await db().query('INSERT INTO usuarios (sucursal_id,nombre,usuario,password,rol) VALUES ($1,$2,$3,$4,$5)',[newSid,'Admin '+nombre,'admin_s'+newSid,hash,'admin']);const tarifas=await db().query('SELECT * FROM tarifas WHERE sucursal_id=$1',[sid(req)]);for(const t of tarifas.rows)await db().query('INSERT INTO tarifas (sucursal_id,modalidad_id,modalidad_nombre,horario,vehiculo_id,vehiculo_label,tramo,tramo_label,precio) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[newSid,t.modalidad_id,t.modalidad_nombre,t.horario,t.vehiculo_id,t.vehiculo_label,t.tramo,t.tramo_label,t.precio]);const nueva=await db().query('SELECT * FROM sucursales WHERE id=$1',[newSid]);res.json(nueva.rows[0]);}catch(e){res.status(500).json({error:e.message});}});

router.put('/sucursales/:id',admin,async(req,res)=>{try{await db().query('UPDATE sucursales SET nombre=$1,direccion=$2 WHERE id=$3',[req.body.nombre,req.body.direccion,req.params.id]);res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});

router.get('/usuarios',auth,async(req,res)=>{try{const r=await db().query('SELECT id,nombre,usuario,rol,turno,cupo,activo FROM usuarios WHERE sucursal_id=$1 ORDER BY nombre',[sid(req)]);res.json(r.rows);}catch(e){res.status(500).json({error:e.message});}});

router.post('/usuarios',admin,async(req,res)=>{try{const {nombre,usuario,password,rol,turno,cupo}=req.body;if(!nombre||!usuario)return res.status(400).json({error:'Datos incompletos'});const ex=await db().query('SELECT id FROM usuarios WHERE usuario=$1',[usuario]);if(ex.rows[0])return res.status(400).json({error:'Usuario ya existe'});const r=await db().query('INSERT INTO usuarios (sucursal_id,nombre,usuario,password,rol,turno,cupo) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',[sid(req),nombre,usuario,bcrypt.hashSync(password||'enc123',10),rol||'encargado',turno||'',cupo||null]);res.json({id:r.rows[0].id,nombre,usuario,rol,turno,cupo});}catch(e){res.status(500).json({error:e.message});}});

router.put('/usuarios/:id',admin,async(req,res)=>{try{const u=(await db().query('SELECT * FROM usuarios WHERE id=$1 AND sucursal_id=$2',[req.params.id,sid(req)])).rows[0];if(!u)return res.status(404).json({error:'No encontrado'});await db().query('UPDATE usuarios SET nombre=$1,turno=$2,rol=$3,activo=$4,cupo=$5 WHERE id=$6',[req.body.nombre||u.nombre,req.body.turno??u.turno??'',req.body.rol||u.rol,req.body.activo!==undefined?req.body.activo:u.activo,req.body.cupo!==undefined?req.body.cupo||null:u.cupo,u.id]);if(req.body.password)await db().query('UPDATE usuarios SET password=$1 WHERE id=$2',[bcrypt.hashSync(req.body.password,10),u.id]);res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});

// ─── FUNCIÓN CENTRAL: calcula el pico de ocupación simultánea por franja horaria ───
async function calcPicoOcupacion(sucursal_id){
  const horarios=(await db().query('SELECT * FROM modalidades_horario WHERE sucursal_id=$1 AND cuenta_cupo=true',[sucursal_id])).rows;
  const clientes=(await db().query("SELECT modalidad,vehiculo1_tipo,vehiculo2_tipo FROM clientes WHERE sucursal_id=$1 AND activo=1",[sucursal_id])).rows;
  const franjas=new Array(33).fill(0);
  const franjas_motos=new Array(33).fill(0);
  for(const c of clientes){
    const esMotos=(c.vehiculo1_tipo==='moto'&&(!c.vehiculo2_tipo||c.vehiculo2_tipo==='moto'||c.vehiculo2_tipo===''));
    const h=horarios.find(x=>x.modalidad_id===c.modalidad);
    if(!h)continue;
    if(esMotos){for(let i=h.hora_desde;i<h.hora_hasta&&i<33;i++)franjas_motos[i]++;}
    else{for(let i=h.hora_desde;i<h.hora_hasta&&i<33;i++)franjas[i]++;}
  }
  const pico=Math.max(...franjas);
  const pico_motos=Math.max(...franjas_motos);
  const franjasPico=franjas.map((v,i)=>({hora:i,ocupacion:v})).filter(f=>f.ocupacion===pico&&pico>0);
  return{pico,pico_motos,franjas,franjas_motos,franjasPico};
}
// ─── CUPOS ───
router.get('/cupos',auth,async(req,res)=>{
  try{
    const s=sid(req);
    const suc=(await db().query('SELECT * FROM sucursales WHERE id=$1',[s])).rows[0];
    const tots=(await db().query('SELECT modalidad,COUNT(*) as c FROM clientes WHERE sucursal_id=$1 AND activo=1 GROUP BY modalidad',[s])).rows;
    const cnt={};tots.forEach(r=>{cnt[r.modalidad]=parseInt(r.c);});
    const total=Object.values(cnt).reduce((a,b)=>a+b,0);
    const{pico,pico_motos,franjas,franjas_motos,franjasPico}=await calcPicoOcupacion(s);
    const cupo=suc.cupo_mensuales||null;
const cupo_motos=suc.cupo_motos||null;
const rot_m=suc.rotacion_promedio_manana||null;
const rot_t=suc.rotacion_promedio_tarde||null;
const rot_m_motos=suc.rotacion_promedio_manana_motos||null;
const rot_t_motos=suc.rotacion_promedio_tarde_motos||null;
const buffer=3;
const vacantes_manana=cupo!==null&&rot_m!==null?cupo-pico-rot_m-buffer:null;
const vacantes_tarde=cupo!==null&&rot_t!==null?cupo-pico-rot_t-buffer:null;
const vacantes_motos_manana=cupo_motos!==null&&rot_m_motos!==null?cupo_motos-pico_motos-rot_m_motos-buffer:null;
const vacantes_motos_tarde=cupo_motos!==null&&rot_t_motos!==null?cupo_motos-pico_motos-rot_t_motos-buffer:null;
res.json({sucursal:suc,cupo_mensuales:cupo,cupo_motos,rotacion_promedio_manana:rot_m,rotacion_promedio_tarde:rot_t,rotacion_promedio_manana_motos:rot_m_motos,rotacion_promedio_tarde_motos:rot_t_motos,ocupado_total:total,pico_simultaneo:pico,pico_motos,franjas_pico:franjasPico,franjas_completo:franjas,detalle_modalidades:cnt,libre:cupo!==null?cupo-pico:null,vacantes_manana,vacantes_tarde,vacantes_motos_manana,vacantes_motos_tarde});
  }catch(e){res.status(500).json({error:e.message});}
});

router.put('/cupos',auth,async(req,res)=>{
  try{
    await db().query('UPDATE sucursales SET cupo_mensuales=$1,rotacion_promedio_manana=$2,rotacion_promedio_tarde=$3,cupo_motos=$4,rotacion_promedio_manana_motos=$5,rotacion_promedio_tarde_motos=$6 WHERE id=$7',[req.body.cupo_mensuales||null,req.body.rotacion_promedio_manana||null,req.body.rotacion_promedio_tarde||null,req.body.cupo_motos||null,req.body.rotacion_promedio_manana_motos||null,req.body.rotacion_promedio_tarde_motos||null,sid(req)]);
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});

router.get('/cupos/preview',auth,async(req,res)=>{
  try{
    const s=sid(req);
    const{pico,franjas,franjasPico}=await calcPicoOcupacion(s);
    const suc=(await db().query('SELECT cupo_mensuales,lugares_fisicos,rotacion_promedio_manana,rotacion_promedio_tarde FROM sucursales WHERE id=$1',[s])).rows[0];
    res.json({
      cupo_mensuales:suc.cupo_mensuales||null,
      lugares_fisicos:suc.lugares_fisicos||null,
      rotacion_promedio_manana:suc.rotacion_promedio_manana||null,
      rotacion_promedio_tarde:suc.rotacion_promedio_tarde||null,
      pico_actual:pico,
      franjas_pico:franjasPico,
      franjas_completo:franjas
    });
  }catch(e){res.status(500).json({error:e.message});}
});

router.get('/tarifas',auth,async(req,res)=>{try{const r=await db().query('SELECT * FROM tarifas WHERE sucursal_id=$1 ORDER BY modalidad_id,vehiculo_id,tramo',[sid(req)]);res.json(r.rows);}catch(e){res.status(500).json({error:e.message});}});

router.put('/tarifas',admin,async(req,res)=>{try{for(const u of req.body.updates)await db().query('UPDATE tarifas SET precio=$1 WHERE id=$2 AND sucursal_id=$3',[u.precio,u.id,sid(req)]);res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});

router.get('/clientes',auth,async(req,res)=>{try{const {activo}=req.query;let q='SELECT * FROM clientes WHERE sucursal_id=$1';const p=[sid(req)];if(activo!==undefined){q+=' AND activo=$2';p.push(activo==='true'||activo==='1'?1:0);}const r=await db().query(q+' ORDER BY nombre',p);res.json(r.rows);}catch(e){res.status(500).json({error:e.message});}});

router.get('/clientes/:id',auth,async(req,res)=>{try{const r=await db().query('SELECT * FROM clientes WHERE id=$1 AND sucursal_id=$2',[req.params.id,sid(req)]);if(!r.rows[0])return res.status(404).json({error:'No encontrado'});res.json(r.rows[0]);}catch(e){res.status(500).json({error:e.message});}});

router.post('/clientes',auth,async(req,res)=>{
  try{
    const d=req.body;
    if(!d.nombre||!d.modalidad)return res.status(400).json({error:'Nombre y modalidad requeridos'});

    // Validación cupo por encargado (existente)
    if(d.turno_encargado_id){
      const enc=(await db().query('SELECT cupo FROM usuarios WHERE id=$1',[d.turno_encargado_id])).rows[0];
      if(enc?.cupo){
        const act=parseInt((await db().query('SELECT COUNT(*) as c FROM clientes WHERE turno_encargado_id=$1 AND activo=1',[d.turno_encargado_id])).rows[0].c);
        if(act>=enc.cupo)return res.status(409).json({error:'Cupo lleno para este turno'});
      }
    }

    // Validación cupo pool único (nueva lógica)
    // Solo si no viene el flag force:true (el front lo manda cuando el usuario confirma el aviso)
    if(!d.force){
      const suc=(await db().query('SELECT cupo_mensuales FROM sucursales WHERE id=$1',[sid(req)])).rows[0];
      if(suc?.cupo_mensuales){
        const hMod=(await db().query('SELECT * FROM modalidades_horario WHERE sucursal_id=$1 AND modalidad_id=$2 AND cuenta_cupo=true',[sid(req),d.modalidad])).rows[0];
        if(hMod){
          // Simular el pico con el nuevo cliente incluido
          const horarios=(await db().query('SELECT * FROM modalidades_horario WHERE sucursal_id=$1 AND cuenta_cupo=true',[sid(req)])).rows;
          const clientes=(await db().query("SELECT modalidad,vehiculo1_tipo FROM clientes WHERE sucursal_id=$1 AND activo=1",[sid(req)])).rows;
          const franjas=new Array(33).fill(0);
          for(const c of clientes){
            if(c.vehiculo1_tipo==='moto')continue;
            const hc=horarios.find(x=>x.modalidad_id===c.modalidad);
            if(!hc)continue;
            for(let i=hc.hora_desde;i<hc.hora_hasta&&i<33;i++)franjas[i]++;
          }
          // Sumar el nuevo cliente
          for(let i=hMod.hora_desde;i<hMod.hora_hasta&&i<33;i++)franjas[i]++;
          const picoNuevo=Math.max(...franjas);
          if(picoNuevo>suc.cupo_mensuales){
            const horaConflicto=franjas.indexOf(picoNuevo);
            return res.status(409).json({
              alerta:true,
              mensaje:`Con este alta se supera el cupo en la franja ${horaConflicto}-${horaConflicto+1}hs (${picoNuevo}/${suc.cupo_mensuales}). ¿Querés continuar igual?`,
              pico_nuevo:picoNuevo,
              cupo:suc.cupo_mensuales
            });
          }
        }
      }
    }

    const r=await db().query(`INSERT INTO clientes (sucursal_id,nombre,dni,cel,tel,tel_ref_parentesco,dom,trabajo,modalidad,turno_encargado_id,vehiculo1_tipo,vehiculo1_marca,vehiculo1_modelo,vehiculo1_color,vehiculo1_patente,vehiculo2_tipo,vehiculo2_marca,vehiculo2_modelo,vehiculo2_color,vehiculo2_patente,obs,ingreso,activo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,1) RETURNING id`,[sid(req),d.nombre,d.dni||'',d.cel||'',d.tel||'',d.tel_ref_parentesco||'',d.dom||'',d.trabajo||'',d.modalidad,d.turno_encargado_id||null,d.vehiculo1_tipo||'auto',d.vehiculo1_marca||'',d.vehiculo1_modelo||'',d.vehiculo1_color||'',d.vehiculo1_patente||'',d.vehiculo2_tipo||'',d.vehiculo2_marca||'',d.vehiculo2_modelo||'',d.vehiculo2_color||'',d.vehiculo2_patente||'',d.obs||'',d.ingreso||'']);
    const nuevo=await db().query('SELECT * FROM clientes WHERE id=$1',[r.rows[0].id]);
    res.json(nuevo.rows[0]);
  }catch(e){res.status(500).json({error:e.message});}
});

router.put('/clientes/:id',auth,async(req,res)=>{try{const d=req.body;const c=(await db().query('SELECT * FROM clientes WHERE id=$1 AND sucursal_id=$2',[req.params.id,sid(req)])).rows[0];if(!c)return res.status(404).json({error:'No encontrado'});await db().query(`UPDATE clientes SET nombre=$1,dni=$2,cel=$3,tel=$4,tel_ref_parentesco=$5,dom=$6,trabajo=$7,modalidad=$8,turno_encargado_id=$9,vehiculo1_tipo=$10,vehiculo1_marca=$11,vehiculo1_modelo=$12,vehiculo1_color=$13,vehiculo1_patente=$14,vehiculo2_tipo=$15,vehiculo2_marca=$16,vehiculo2_modelo=$17,vehiculo2_color=$18,vehiculo2_patente=$19,obs=$20,ingreso=$21 WHERE id=$22 AND sucursal_id=$23`,[d.nombre,d.dni||'',d.cel||'',d.tel||'',d.tel_ref_parentesco||'',d.dom||'',d.trabajo||'',d.modalidad,d.turno_encargado_id||null,d.vehiculo1_tipo||'auto',d.vehiculo1_marca||'',d.vehiculo1_modelo||'',d.vehiculo1_color||'',d.vehiculo1_patente||'',d.vehiculo2_tipo||'',d.vehiculo2_marca||'',d.vehiculo2_modelo||'',d.vehiculo2_color||'',d.vehiculo2_patente||'',d.obs||'',d.ingreso||'',req.params.id,sid(req)]);res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});

router.post('/clientes/:id/baja',admin,async(req,res)=>{try{await db().query('UPDATE clientes SET activo=0,fecha_baja=$1 WHERE id=$2 AND sucursal_id=$3',[req.body.fecha_baja||new Date().toISOString().slice(0,10),req.params.id,sid(req)]);res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});

router.post('/clientes/:id/reactivar',admin,async(req,res)=>{try{await db().query('UPDATE clientes SET activo=1,fecha_baja=NULL WHERE id=$1 AND sucursal_id=$2',[req.params.id,sid(req)]);res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});

router.get('/pagos',auth,async(req,res)=>{try{const {cliente_id,mes,anio}=req.query;let q=`SELECT p.*,c.nombre as cliente_nombre,u.nombre as encargado_nombre FROM pagos p LEFT JOIN clientes c ON c.id=p.cliente_id LEFT JOIN usuarios u ON u.id=p.encargado_id WHERE p.sucursal_id=$1 AND p.anulado=0`;const p=[sid(req)];let i=2;if(cliente_id){q+=` AND p.cliente_id=$${i++}`;p.push(cliente_id);}if(mes){q+=` AND p.mes=$${i++}`;p.push(mes);}if(anio){q+=` AND substring(p.mes,1,4)=$${i++}`;p.push(anio);}if(req.query.desde&&req.query.hasta){q+=` AND p.fecha>=$${i++} AND p.fecha<=$${i++}`;p.push(req.query.desde);p.push(req.query.hasta);}const r=await db().query(q+' ORDER BY p.created_at DESC',p);res.json(r.rows);}catch(e){res.status(500).json({error:e.message});}});

router.post('/pagos',auth,async(req,res)=>{try{const d=req.body;if(!d.cliente_id||!d.fecha||!d.mes)return res.status(400).json({error:'Datos incompletos'});const monto_efectivo=parseFloat(d.monto_efectivo)||0;const monto_transferencia=parseFloat(d.monto_transferencia)||0;const importe_abonado=monto_efectivo+monto_transferencia||parseFloat(d.importe_abonado)||0;const forma_pago=monto_efectivo>0&&monto_transferencia>0?'mixto':monto_transferencia>0?'transferencia':'efectivo';const r=await db().query('INSERT INTO pagos (sucursal_id,cliente_id,fecha,mes,importe_esperado,importe_abonado,monto_efectivo,monto_transferencia,forma_pago,encargado_id,obs) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',[sid(req),d.cliente_id,d.fecha,d.mes,d.importe_esperado||0,importe_abonado,monto_efectivo,monto_transferencia,forma_pago,req.session.user.id,d.obs||'']);const nuevo=await db().query('SELECT * FROM pagos WHERE id=$1',[r.rows[0].id]);res.json(nuevo.rows[0]);}catch(e){res.status(500).json({error:e.message});}});

router.put('/pagos/:id',admin,async(req,res)=>{try{const p=(await db().query('SELECT * FROM pagos WHERE id=$1 AND sucursal_id=$2',[req.params.id,sid(req)])).rows[0];if(!p)return res.status(404).json({error:'No encontrado'});const me=parseFloat(req.body.monto_efectivo)??p.monto_efectivo??0;const mt=parseFloat(req.body.monto_transferencia)??p.monto_transferencia??0;const abo=me+mt||req.body.importe_abonado||p.importe_abonado;const fp=me>0&&mt>0?'mixto':mt>0?'transferencia':'efectivo';await db().query('UPDATE pagos SET fecha=$1,mes=$2,importe_esperado=$3,importe_abonado=$4,monto_efectivo=$5,monto_transferencia=$6,forma_pago=$7,obs=$8 WHERE id=$9',[req.body.fecha||p.fecha,req.body.mes||p.mes,req.body.importe_esperado||p.importe_esperado,abo,me,mt,fp,(req.body.obs||p.obs||''),p.id]);res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});

router.post('/pagos/:id/anular',admin,async(req,res)=>{try{const p=(await db().query('SELECT * FROM pagos WHERE id=$1 AND sucursal_id=$2',[req.params.id,sid(req)])).rows[0];if(!p)return res.status(404).json({error:'No encontrado'});await db().query('UPDATE pagos SET anulado=1,anulado_motivo=$1 WHERE id=$2',[req.body.motivo||'',p.id]);res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});

router.get('/clientes/:id/cuenta',auth,async(req,res)=>{try{
  const c=(await db().query('SELECT * FROM clientes WHERE id=$1 AND sucursal_id=$2',[req.params.id,sid(req)])).rows[0];
  if(!c)return res.status(404).json({error:'No encontrado'});
  const pagos=(await db().query(`SELECT p.*,u.nombre as encargado_nombre FROM pagos p LEFT JOIN usuarios u ON u.id=p.encargado_id WHERE p.cliente_id=$1 AND p.sucursal_id=$2 ORDER BY p.mes DESC,p.created_at DESC`,[req.params.id,sid(req)])).rows;
  const senas=(await db().query(`SELECT * FROM senas WHERE cliente_id=$1 AND sucursal_id=$2 ORDER BY created_at DESC`,[req.params.id,sid(req)])).rows;
  const meses={};
  for(const p of pagos){
    if(!meses[p.mes])meses[p.mes]={mes:p.mes,pagos:[],total_esperado:0,total_abonado:0};
    meses[p.mes].pagos.push(p);
    if(!p.anulado){meses[p.mes].total_esperado=Math.max(meses[p.mes].total_esperado,parseFloat(p.importe_esperado)||0);meses[p.mes].total_abonado+=parseFloat(p.importe_abonado)||0;}
  }
  const saldo_total=Object.values(meses).reduce((s,m)=>s+(m.total_abonado-m.total_esperado),0);
  res.json({cliente:c,cuenta:Object.values(meses).sort((a,b)=>b.mes.localeCompare(a.mes)),saldo_total,senas});
}catch(e){res.status(500).json({error:e.message});}});

router.get('/dashboard',auth,async(req,res)=>{try{const s=sid(req);const mes=new Date().toISOString().slice(0,7);const hoy=new Date().toISOString().slice(0,10);const activos=parseInt((await db().query('SELECT COUNT(*) as c FROM clientes WHERE sucursal_id=$1 AND activo=1',[s])).rows[0].c);const pagaron=parseInt((await db().query('SELECT COUNT(DISTINCT cliente_id) as c FROM pagos WHERE sucursal_id=$1 AND mes=$2 AND anulado=0',[s,mes])).rows[0].c);const recMes=parseFloat((await db().query('SELECT COALESCE(SUM(importe_abonado),0) as v FROM pagos WHERE sucursal_id=$1 AND mes=$2 AND anulado=0',[s,mes])).rows[0].v)||0;const recHoy=parseFloat((await db().query('SELECT COALESCE(SUM(importe_abonado),0) as v FROM pagos WHERE sucursal_id=$1 AND fecha=$2 AND anulado=0',[s,hoy])).rows[0].v)||0;const recEfectivo=parseFloat((await db().query('SELECT COALESCE(SUM(monto_efectivo),0) as v FROM pagos WHERE sucursal_id=$1 AND mes=$2 AND anulado=0',[s,mes])).rows[0].v)||0;const recTransferencia=parseFloat((await db().query('SELECT COALESCE(SUM(monto_transferencia),0) as v FROM pagos WHERE sucursal_id=$1 AND mes=$2 AND anulado=0',[s,mes])).rows[0].v)||0;const conSaldo=parseInt((await db().query('SELECT COUNT(DISTINCT cliente_id) as c FROM pagos WHERE sucursal_id=$1 AND mes=$2 AND anulado=0 AND importe_abonado<importe_esperado',[s,mes])).rows[0].c);res.json({activos,pagaron,sinPagar:activos-pagaron,recMes,recHoy,recEfectivo,recTransferencia,conSaldo,mes});}catch(e){res.status(500).json({error:e.message});}});

router.get('/resumen',auth,async(req,res)=>{try{const s=sid(req);const anio=req.query.anio||new Date().getFullYear().toString();const clientes=(await db().query('SELECT id,nombre FROM clientes WHERE sucursal_id=$1 AND activo=1 ORDER BY nombre',[s])).rows;const pagos=(await db().query(`SELECT cliente_id,mes,SUM(importe_abonado) as total FROM pagos WHERE sucursal_id=$1 AND substring(mes,1,4)=$2 AND anulado=0 GROUP BY cliente_id,mes`,[s,anio])).rows;res.json({clientes,pagos});}catch(e){res.status(500).json({error:e.message});}});

router.get('/deudores',auth,async(req,res)=>{try{const s=sid(req);const {mes,desde,hasta,todos}=req.query;const clientes=(await db().query('SELECT * FROM clientes WHERE sucursal_id=$1 AND activo=1',[s])).rows;let pagos;if(todos==='1'){
  const mesHoy=new Date().toISOString().slice(0,7);
  const rows=(await db().query(`SELECT cliente_id,mes,SUM(importe_abonado) as abonado,MAX(importe_esperado) as esperado FROM pagos WHERE sucursal_id=$1 AND anulado=0 AND mes<=$2 GROUP BY cliente_id,mes HAVING SUM(importe_abonado)<MAX(importe_esperado)`,[s,mesHoy])).rows;
  const deudaMap={};
  rows.forEach(r=>{const cid=parseInt(r.cliente_id);if(!deudaMap[cid])deudaMap[cid]={abonado:0,esperado:0};deudaMap[cid].abonado+=parseFloat(r.abonado);deudaMap[cid].esperado+=parseFloat(r.esperado);});
  const mesAnterior=new Date(new Date(mesHoy+'-15').setMonth(new Date(mesHoy+'-15').getMonth()-1)).toISOString().slice(0,7);
  const conPagoReciente=new Set((await db().query(`SELECT DISTINCT cliente_id FROM pagos WHERE sucursal_id=$1 AND mes IN ($2,$3) AND anulado=0`,[s,mesHoy,mesAnterior])).rows.map(r=>parseInt(r.cliente_id)));
  clientes.filter(c=>!conPagoReciente.has(c.id)&&!deudaMap[c.id]).forEach(c=>{deudaMap[c.id]={abonado:0,esperado:0};});
  pagos=Object.entries(deudaMap).map(([id,v])=>({cliente_id:parseInt(id),abonado:v.abonado,esperado:v.esperado}));
}else if(desde&&hasta){pagos=(await db().query('SELECT cliente_id,SUM(importe_abonado) as abonado,SUM(importe_esperado) as esperado FROM pagos WHERE sucursal_id=$1 AND mes>=$2 AND mes<=$3 AND anulado=0 GROUP BY cliente_id',[s,desde,hasta])).rows;}else{const m=mes||new Date().toISOString().slice(0,7);pagos=(await db().query('SELECT cliente_id,SUM(importe_abonado) as abonado,MAX(importe_esperado) as esperado FROM pagos WHERE sucursal_id=$1 AND mes=$2 AND anulado=0 GROUP BY cliente_id',[s,m])).rows;}const map={};pagos.forEach(p=>map[p.cliente_id]={abonado:parseFloat(p.abonado),esperado:parseFloat(p.esperado)});const deudores=clientes.map(c=>{const p=map[c.id];if(!p)return{...c,abonado:0,esperado:0,deuda:0,sin_pago:true};const deuda=parseFloat(p.esperado)-parseFloat(p.abonado);return{...c,abonado:p.abonado,esperado:p.esperado,deuda,sin_pago:false};}).filter(c=>c.sin_pago||c.deuda>0).sort((a,b)=>b.deuda-a.deuda);res.json(deudores);}catch(e){res.status(500).json({error:e.message});}});

router.get('/reportes/pagos',auth,async(req,res)=>{try{const s=sid(req);const {desde,hasta}=req.query;const rows=(await db().query(`SELECT substring(p.mes,1,7) as mes, c.modalidad, SUM(p.importe_abonado) as total, COALESCE(SUM(p.monto_efectivo),0) as efectivo, COALESCE(SUM(p.monto_transferencia),0) as transferencia, COUNT(*) as cantidad FROM pagos p JOIN clientes c ON c.id=p.cliente_id WHERE p.sucursal_id=$1 AND p.anulado=0 AND p.mes>=$2 AND p.mes<=$3 GROUP BY substring(p.mes,1,7),c.modalidad ORDER BY mes DESC,modalidad`,[s,desde||'2020-01',hasta||'2099-12'])).rows;res.json(rows);}catch(e){res.status(500).json({error:e.message});}});

// ─── ADMIN UTILS ───
router.get('/admin/migrar-cupo-unico',admin,async(req,res)=>{
  try{
    await db().query('ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS cupo_mensuales INTEGER');
    res.json({ok:true,msg:'Columna cupo_mensuales agregada'});
  }catch(e){res.status(500).json({error:e.message});}
});

router.get('/admin/fix-modalidad',admin,async(req,res)=>{try{await db().query("UPDATE tarifas SET modalidad_nombre='Comercial' WHERE modalidad_nombre='Mensual'");await db().query("UPDATE clientes SET modalidad=replace(modalidad,'mensual','comercial') WHERE modalidad LIKE '%mensual%'");res.json({ok:true,msg:'Listo'});}catch(e){res.status(500).json({error:e.message});}});

router.get('/admin/ver-tarifas',admin,async(req,res)=>{try{const t=await db().query("SELECT DISTINCT modalidad_id,modalidad_nombre,horario FROM tarifas ORDER BY modalidad_id");res.json(t.rows);}catch(e){res.status(500).json({error:e.message});}});

router.get('/admin/crear-parcial',admin,async(req,res)=>{try{const TRAMOS_LABELS=['1 al 10','11 al 20','21 al 31','1 al 10 (2°mes)','11 al 20 (2°mes)','21 al 31 (2°mes)','1 al 10 (3°mes)','11 al 20 (3°mes)','21 al 31 (3°mes)','1 al 10 (4°mes)'];const VEH_LABELS={moto:'Moto',auto:'Auto',camioneta:'Camioneta',trafic:'Trafic',trafic_larga:'Trafic larga'};const s=await db().query('SELECT DISTINCT sucursal_id FROM tarifas');const vehs=['moto','auto','camioneta','trafic','trafic_larga'];let count=0;for(const row of s.rows){const sid=row.sucursal_id;for(const veh of vehs){for(let tramo=0;tramo<10;tramo++){const existe=await db().query('SELECT id FROM tarifas WHERE sucursal_id=$1 AND modalidad_id=$2 AND vehiculo_id=$3 AND tramo=$4',[sid,'parcial',veh,tramo]);if(!existe.rows.length){await db().query('INSERT INTO tarifas (sucursal_id,modalidad_id,modalidad_nombre,horario,vehiculo_id,vehiculo_label,tramo,tramo_label,precio) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[sid,'parcial','Parcial','14 a 08 hs · Sáb/Dom/Fer 24hs',veh,VEH_LABELS[veh],tramo,TRAMOS_LABELS[tramo],0]);count++;}}}}res.json({ok:true,insertados:count});}catch(e){res.status(500).json({error:e.message});}});

router.get('/admin/migrar-senas',admin,async(req,res)=>{try{await db().query('ALTER TABLE senas ADD COLUMN IF NOT EXISTS estadia_id INTEGER');res.json({ok:true,msg:'Columna estadia_id agregada'});}catch(e){res.status(500).json({error:e.message});}});

router.get('/admin/crear-tablas-estadia',admin,async(req,res)=>{try{await db().query(`CREATE TABLE IF NOT EXISTS estadias (id SERIAL PRIMARY KEY,sucursal_id INTEGER,cliente_nombre VARCHAR(200),patente VARCHAR(20),vehiculo_tipo VARCHAR(30) DEFAULT 'auto',fecha_entrada DATE,fecha_salida DATE,dias INTEGER,importe DECIMAL(12,2) DEFAULT 0,forma_pago VARCHAR(20) DEFAULT 'efectivo',monto_efectivo DECIMAL(12,2) DEFAULT 0,monto_transferencia DECIMAL(12,2) DEFAULT 0,estado VARCHAR(20) DEFAULT 'activo',obs TEXT DEFAULT '',created_at TIMESTAMP DEFAULT NOW())`);await db().query(`CREATE TABLE IF NOT EXISTS tarifas_estadia (id SERIAL PRIMARY KEY,sucursal_id INTEGER,dias INTEGER,dias_label VARCHAR(30),vehiculo_id VARCHAR(30),vehiculo_label VARCHAR(30),precio DECIMAL(12,2) DEFAULT 0)`);await db().query(`CREATE TABLE IF NOT EXISTS senas (id SERIAL PRIMARY KEY,sucursal_id INTEGER,cliente_id INTEGER,cliente_nombre VARCHAR(200),concepto VARCHAR(50) DEFAULT 'llave',monto DECIMAL(12,2) DEFAULT 0,fecha_entrega DATE,fecha_devolucion DATE,estado VARCHAR(20) DEFAULT 'activa',obs TEXT DEFAULT '',created_at TIMESTAMP DEFAULT NOW())`);res.json({ok:true,msg:'Tablas creadas'});}catch(e){res.status(500).json({error:e.message});}});

router.get('/admin/test-senas',admin,async(req,res)=>{try{const cols=await db().query("SELECT column_name FROM information_schema.columns WHERE table_name='senas' ORDER BY ordinal_position");const data=await db().query('SELECT * FROM senas WHERE sucursal_id=$1 LIMIT 1',[sid(req)]);res.json({columnas:cols.rows.map(r=>r.column_name),filas:data.rows});}catch(e){res.status(500).json({error:e.message});}});

router.get('/admin/test-senas2',admin,async(req,res)=>{try{const r=await db().query(`SELECT s.*, CASE WHEN s.estadia_id IS NOT NULL THEN 'estadía' ELSE 'abono' END as origen FROM senas s WHERE s.sucursal_id = $1 ORDER BY s.created_at DESC`,[sid(req)]);res.json(r.rows);}catch(e){res.status(500).json({error:e.message});}});

router.get('/estadias',auth,async(req,res)=>{try{const r=await db().query(`SELECT e.*,s.id as sena_id,s.monto as sena_monto,s.estado as sena_estado FROM estadias e LEFT JOIN senas s ON s.estadia_id=e.id AND s.concepto='llave' WHERE e.sucursal_id=$1 ORDER BY e.created_at DESC`,[sid(req)]);res.json(r.rows);}catch(e){res.status(500).json({error:e.message});}});

router.post('/estadias',auth,async(req,res)=>{try{const d=req.body;const r=await db().query('INSERT INTO estadias (sucursal_id,cliente_nombre,patente,vehiculo_tipo,fecha_entrada,fecha_salida,dias,importe,forma_pago,monto_efectivo,monto_transferencia,estado,obs) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',[sid(req),d.cliente_nombre,d.patente||'',d.vehiculo_tipo||'auto',d.fecha_entrada,d.fecha_salida||null,d.dias||0,d.importe||0,d.forma_pago||'efectivo',d.monto_efectivo||0,d.monto_transferencia||0,d.estado||'activo',d.obs||'']);const estadia=r.rows[0];if(d.sena_llave&&parseFloat(d.sena_llave)>0){await db().query('INSERT INTO senas (sucursal_id,estadia_id,cliente_nombre,concepto,monto,fecha_entrega,estado,obs) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[sid(req),estadia.id,d.cliente_nombre,'llave',parseFloat(d.sena_llave),d.fecha_entrada,'activa','Estadía — '+(d.patente||'')]);}res.json(estadia);}catch(e){res.status(500).json({error:e.message});}});

router.put('/estadias/:id',auth,async(req,res)=>{try{const d=req.body;await db().query('UPDATE estadias SET fecha_salida=$1,dias=$2,importe=$3,forma_pago=$4,monto_efectivo=$5,monto_transferencia=$6,estado=$7,obs=$8 WHERE id=$9 AND sucursal_id=$10',[d.fecha_salida,d.dias,d.importe,d.forma_pago||'efectivo',d.monto_efectivo||0,d.monto_transferencia||0,d.estado||'activo',d.obs||'',req.params.id,sid(req)]);res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});

router.get('/tarifas-estadia',auth,async(req,res)=>{try{const r=await db().query('SELECT * FROM tarifas_estadia WHERE sucursal_id=$1 ORDER BY dias,vehiculo_id',[sid(req)]);res.json(r.rows);}catch(e){res.status(500).json({error:e.message});}});

router.put('/tarifas-estadia',admin,async(req,res)=>{try{for(const u of req.body.updates)await db().query('UPDATE tarifas_estadia SET precio=$1 WHERE id=$2 AND sucursal_id=$3',[u.precio,u.id,sid(req)]);res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});

router.get('/admin/init-tarifas-estadia',admin,async(req,res)=>{try{const DIAS=[{d:1,l:'1 día'},{d:2,l:'2 días'},{d:3,l:'3 días'},{d:4,l:'4 días'},{d:5,l:'5 días'},{d:6,l:'6 días'},{d:7,l:'Semana'},{d:14,l:'2ª Semana'}];const VEHS=[{id:'auto',l:'Auto'},{id:'camioneta',l:'Camioneta'},{id:'trafic',l:'Trafic'},{id:'trafic_larga',l:'Trafic Larga'}];const s=await db().query('SELECT DISTINCT sucursal_id FROM estadias');const sucs=s.rows.map(r=>r.sucursal_id);if(!sucs.length){const all=await db().query('SELECT id FROM sucursales');sucs.push(...all.rows.map(r=>r.id));}let count=0;for(const sid of sucs)for(const d of DIAS)for(const v of VEHS){const ex=await db().query('SELECT id FROM tarifas_estadia WHERE sucursal_id=$1 AND dias=$2 AND vehiculo_id=$3',[sid,d.d,v.id]);if(!ex.rows.length){await db().query('INSERT INTO tarifas_estadia (sucursal_id,dias,dias_label,vehiculo_id,vehiculo_label,precio) VALUES ($1,$2,$3,$4,$5,$6)',[sid,d.d,d.l,v.id,v.l,0]);count++;}}res.json({ok:true,insertados:count});}catch(e){res.status(500).json({error:e.message});}});

router.get('/senas',auth,async(req,res)=>{try{const r=await db().query(`SELECT s.*,CASE WHEN s.estadia_id IS NOT NULL THEN 'estadía' ELSE 'abono' END as origen FROM senas s WHERE s.sucursal_id=$1 ORDER BY s.created_at DESC`,[sid(req)]);res.json(r.rows);}catch(e){res.status(500).json({error:e.message});}});

router.post('/senas',auth,async(req,res)=>{try{const d=req.body;const r=await db().query('INSERT INTO senas (sucursal_id,cliente_id,cliente_nombre,concepto,monto,fecha_entrega,estado,obs) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[sid(req),d.cliente_id||null,d.cliente_nombre||'',d.concepto||'llave',d.monto||0,d.fecha_entrega,d.estado||'activa',d.obs||'']);res.json(r.rows[0]);}catch(e){res.status(500).json({error:e.message});}});

router.put('/senas/:id',auth,async(req,res)=>{try{const d=req.body;await db().query('UPDATE senas SET estado=$1,fecha_devolucion=$2,obs=$3 WHERE id=$4 AND sucursal_id=$5',[d.estado||'activa',d.fecha_devolucion||null,d.obs||'',req.params.id,sid(req)]);res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});

router.get('/admin/init-tarifas-estadia2',admin,async(req,res)=>{try{const DIAS=[{d:1,l:'1 día'},{d:2,l:'2 días'},{d:3,l:'3 días'},{d:4,l:'4 días'},{d:5,l:'5 días'},{d:6,l:'6 días'},{d:7,l:'Semana'},{d:14,l:'2ª Semana'}];const VEHS=[{id:'auto',l:'Auto'},{id:'camioneta',l:'Camioneta'},{id:'trafic',l:'Trafic'},{id:'trafic_larga',l:'Trafic Larga'}];const sucs=await db().query('SELECT id FROM sucursales');let count=0;for(const row of sucs.rows){const s=row.id;for(const d of DIAS){for(const v of VEHS){const ex=await db().query('SELECT id FROM tarifas_estadia WHERE sucursal_id=$1 AND dias=$2 AND vehiculo_id=$3',[s,d.d,v.id]);if(!ex.rows.length){await db().query('INSERT INTO tarifas_estadia (sucursal_id,dias,dias_label,vehiculo_id,vehiculo_label,precio) VALUES ($1,$2,$3,$4,$5,$6)',[s,d.d,d.l,v.id,v.l,0]);count++;}}}}res.json({ok:true,insertados:count});}catch(e){res.status(500).json({error:e.message});}});

router.get('/admin/crear-tabla-pasada',admin,async(req,res)=>{try{await db().query(`CREATE TABLE IF NOT EXISTS pasada_control (id SERIAL PRIMARY KEY,sucursal_id INTEGER,cliente_id INTEGER,fecha DATE DEFAULT CURRENT_DATE,presente BOOLEAN DEFAULT false,created_at TIMESTAMP DEFAULT NOW())`);res.json({ok:true,msg:'Tabla creada'});}catch(e){res.status(500).json({error:e.message});}});

router.get('/control',auth,async(req,res)=>{try{const s=sid(req);const r=await db().query(`SELECT c.id,c.nombre,c.vehiculo1_patente,c.vehiculo2_patente,c.modalidad,COALESCE(p.presente,false) as presente FROM clientes c LEFT JOIN pasada_control p ON p.cliente_id=c.id AND p.sucursal_id=$1 WHERE c.sucursal_id=$1 AND c.activo=1 ORDER BY c.nombre`,[s]);res.json(r.rows);}catch(e){res.status(500).json({error:e.message});}});

router.post('/control/:id',auth,async(req,res)=>{try{const s=sid(req);const existe=await db().query('SELECT id FROM pasada_control WHERE cliente_id=$1 AND sucursal_id=$2',[req.params.id,s]);if(existe.rows.length){await db().query('UPDATE pasada_control SET presente=$1 WHERE cliente_id=$2 AND sucursal_id=$3',[req.body.presente,req.params.id,s]);}else{await db().query('INSERT INTO pasada_control (sucursal_id,cliente_id,presente) VALUES ($1,$2,$3)',[s,req.params.id,req.body.presente]);}res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});

router.post('/control/limpiar',auth,async(req,res)=>{try{await db().query('UPDATE pasada_control SET presente=false WHERE sucursal_id=$1',[sid(req)]);res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});

router.get('/admin/crear-tabla-horarios',admin,async(req,res)=>{try{await db().query(`CREATE TABLE IF NOT EXISTS modalidades_horario (id SERIAL PRIMARY KEY,sucursal_id INTEGER,modalidad_id VARCHAR(50),modalidad_nombre VARCHAR(100),hora_desde INTEGER,hora_hasta INTEGER,cuenta_cupo BOOLEAN DEFAULT true,created_at TIMESTAMP DEFAULT NOW())`);res.json({ok:true,msg:'Tabla creada'});}catch(e){res.status(500).json({error:e.message});}});

router.get('/admin/init-horarios',admin,async(req,res)=>{try{const sucs=await db().query('SELECT id FROM sucursales');const HORARIOS=[{mod:'mensual24',nom:'Mensual 24 hs',desde:0,hasta:24},{mod:'turno1',nom:'Turno 1',desde:7,hasta:14},{mod:'turno2',nom:'Turno 2',desde:14,hasta:22},{mod:'comercial',nom:'Comercial',desde:7,hasta:22},{mod:'parcial',nom:'Parcial',desde:14,hasta:32},{mod:'nocturno',nom:'Nocturno',desde:20,hasta:32}];let count=0;for(const row of sucs.rows){for(const h of HORARIOS){const ex=await db().query('SELECT id FROM modalidades_horario WHERE sucursal_id=$1 AND modalidad_id=$2',[row.id,h.mod]);if(!ex.rows.length){await db().query('INSERT INTO modalidades_horario (sucursal_id,modalidad_id,modalidad_nombre,hora_desde,hora_hasta,cuenta_cupo) VALUES ($1,$2,$3,$4,$5,$6)',[row.id,h.mod,h.nom,h.desde,h.hasta,true]);count++;}}}res.json({ok:true,insertados:count});}catch(e){res.status(500).json({error:e.message});}});

router.get('/horarios',auth,async(req,res)=>{try{const r=await db().query('SELECT * FROM modalidades_horario WHERE sucursal_id=$1 ORDER BY hora_desde',[sid(req)]);res.json(r.rows);}catch(e){res.status(500).json({error:e.message});}});

router.put('/horarios/:id',admin,async(req,res)=>{try{const d=req.body;await db().query('UPDATE modalidades_horario SET hora_desde=$1,hora_hasta=$2,cuenta_cupo=$3 WHERE id=$4 AND sucursal_id=$5',[d.hora_desde,d.hora_hasta,d.cuenta_cupo,req.params.id,sid(req)]);res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});

router.get('/global/resumen',async(req,res)=>{
  try{
    if(!req.session.user||req.session.user.rol!=='admin_global')
      return res.status(403).json({error:'Solo admin global'});
    const db2=getDb();
    const mes=new Date().toISOString().slice(0,7);
    const sucs=(await db2.query('SELECT * FROM sucursales ORDER BY nombre')).rows;
    const data=await Promise.all(sucs.map(async s=>{
      const sid=s.id;
      const activos=parseInt((await db2.query('SELECT COUNT(*) as c FROM clientes WHERE sucursal_id=$1 AND activo=1',[sid])).rows[0].c)||0;
      const pagaron=parseInt((await db2.query('SELECT COUNT(DISTINCT cliente_id) as c FROM pagos WHERE sucursal_id=$1 AND mes=$2 AND anulado=0',[sid,mes])).rows[0].c)||0;
      const recRow=(await db2.query('SELECT COALESCE(SUM(importe_abonado),0) as total,COALESCE(SUM(monto_efectivo),0) as ef,COALESCE(SUM(monto_transferencia),0) as tr FROM pagos WHERE sucursal_id=$1 AND mes=$2 AND anulado=0',[sid,mes])).rows[0];
      const deudoresRows=(await db2.query(`SELECT c.nombre,c.modalidad FROM clientes c WHERE c.sucursal_id=$1 AND c.activo=1 AND c.id NOT IN (SELECT DISTINCT p.cliente_id FROM pagos p WHERE p.sucursal_id=$1 AND p.mes=$2 AND p.anulado=0 AND p.importe_abonado>=p.importe_esperado)`,[sid,mes])).rows;
      const deudores=deudoresRows.length;
      const listaDeudores=deudoresRows.map(c=>c.nombre);
      const tots=(await db2.query('SELECT modalidad,COUNT(*) as c FROM clientes WHERE sucursal_id=$1 AND activo=1 GROUP BY modalidad',[sid])).rows;
      const cnt={};tots.forEach(r=>{cnt[r.modalidad]=parseInt(r.c);});
      const ocupado=Object.values(cnt).reduce((a,b)=>a+b,0);
      return{id:sid,nombre:s.nombre,direccion:s.direccion||'',activos,pagaron,sinPagar:activos-pagaron,deudores,listaDeudores,recTotal:parseFloat(recRow.total)||0,recEfectivo:parseFloat(recRow.ef)||0,recTransferencia:parseFloat(recRow.tr)||0,cupo_total:s.cupo_total||null,ocupado_total:ocupado};
    }));
    const totales=data.reduce((acc,s)=>({activos:acc.activos+s.activos,pagaron:acc.pagaron+s.pagaron,sinPagar:acc.sinPagar+s.sinPagar,deudores:acc.deudores+s.deudores,recTotal:acc.recTotal+s.recTotal,recEfectivo:acc.recEfectivo+s.recEfectivo,recTransferencia:acc.recTransferencia+s.recTransferencia}),{activos:0,pagaron:0,sinPagar:0,deudores:0,recTotal:0,recEfectivo:0,recTransferencia:0});
    res.json({sucursales:data,totales,mes});
  }catch(e){res.status(500).json({error:e.message});}
});

module.exports=router;
