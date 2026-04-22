const express=require('express');const router=express.Router();const bcrypt=require('bcryptjs');const {getDb}=require('../db/database');
router.post('/login',(req,res)=>{const {usuario,password,sucursal_id}=req.body;if(!usuario||!password||!sucursal_id)return res.status(400).json({error:'Datos incompletos'});const db=getDb();const user=db.prepare('SELECT * FROM usuarios WHERE usuario=? AND sucursal_id=? AND activo=1').get(usuario,sucursal_id);if(!user||!bcrypt.compareSync(password,user.password))return res.status(401).json({error:'Usuario o contraseña incorrectos'});req.session.user={id:user.id,nombre:user.nombre,rol:user.rol,turno:user.turno,sucursal_id:user.sucursal_id};res.json({ok:true,user:req.session.user});});
router.post('/logout',(req,res)=>{req.session.destroy();res.json({ok:true});});
router.get('/me',(req,res)=>{if(!req.session.user)return res.status(401).json({error:'No autenticado'});res.json(req.session.user);});
module.exports=router;
