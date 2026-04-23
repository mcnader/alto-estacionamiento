const express=require('express');
const router=express.Router();
const bcrypt=require('bcryptjs');
const {getDb}=require('../db/database');

router.post('/login',async(req,res)=>{
  try{
    const {usuario,password,sucursal_id}=req.body;
    if(!usuario||!password||!sucursal_id)return res.status(400).json({error:'Datos incompletos'});
    const {rows}=await getDb().query('SELECT * FROM usuarios WHERE usuario=$1 AND sucursal_id=$2 AND activo=1',[usuario,sucursal_id]);
    const user=rows[0];
    if(!user||!bcrypt.compareSync(password,user.password))return res.status(401).json({error:'Usuario o contraseña incorrectos'});
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
