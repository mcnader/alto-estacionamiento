const express=require('express');
const router=express.Router();
const bcrypt=require('bcryptjs');
const {getDb}=require('../db/database');

router.post('/login',async(req,res)=>{
  try{
    const {usuario,password,sucursal_id}=req.body;
    if(!usuario||!password)return res.status(400).json({error:'Datos incompletos'});

    // Login global — no requiere sucursal_id
    if(usuario==='admin_global'){
      const {rows}=await getDb().query(
        "SELECT * FROM usuarios WHERE usuario='admin_global' AND activo=1"
      );
      const user=rows[0];
      if(!user||!bcrypt.compareSync(password,user.password))
        return res.status(401).json({error:'Usuario o contraseña incorrectos'});
      req.session.user={id:user.id,nombre:user.nombre,rol:'admin_global',sucursal_id:null};
      return res.json({ok:true,user:req.session.user});
    }

    // Login normal — requiere sucursal_id
    if(!sucursal_id)return res.status(400).json({error:'Datos incompletos'});
    const {rows}=await getDb().query(
      'SELECT * FROM usuarios WHERE usuario=$1 AND sucursal_id=$2 AND activo=1',
      [usuario,sucursal_id]
    );
    const user=rows[0];
    if(!user||!bcrypt.compareSync(password,user.password))
      return res.status(401).json({error:'Usuario o contraseña incorrectos'});
    req.session.user={id:user.id,nombre:user.nombre,rol:user.rol,turno:user.turno,sucursal_id:user.sucursal_id};
    res.json({ok:true,user:req.session.user});
  }catch(e){res.status(500).json({error:e.message});}
});

// Login directo a una sucursal desde el dashboard global
router.post('/login-sucursal',async(req,res)=>{
  try{
    if(!req.session.user||req.session.user.rol!=='admin_global')
      return res.status(403).json({error:'Solo admin global'});
    const {sucursal_id}=req.body;
    if(!sucursal_id)return res.status(400).json({error:'Sucursal requerida'});
    // Buscar el usuario admin de esa sucursal
    const {rows}=await getDb().query(
      "SELECT * FROM usuarios WHERE sucursal_id=$1 AND rol='admin' AND activo=1 ORDER BY id LIMIT 1",
      [sucursal_id]
    );
    const user=rows[0];
    if(!user)return res.status(404).json({error:'Sin admin en esa sucursal'});
    req.session.user={id:user.id,nombre:user.nombre,rol:user.rol,turno:user.turno,sucursal_id:user.sucursal_id};
    res.json({ok:true,user:req.session.user});
  }catch(e){res.status(500).json({error:e.message});}
});

router.post('/logout',(req,res)=>{req.session.destroy();res.json({ok:true});});

router.get('/me',(req,res)=>{
  if(!req.session.user)return res.status(401).json({error:'No autenticado'});
  res.json(req.session.user);
});

module.exports=router;
