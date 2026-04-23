const express=require('express');
const session=require('express-session');
const path=require('path');
const {initDb}=require('./db/database');

const app=express();
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(session({secret:'altoE_2024',resave:false,saveUninitialized:false,cookie:{maxAge:604800000}}));
app.use(express.static(path.join(__dirname,'public')));
app.use('/api/auth',require('./routes/auth'));
app.use('/api',require('./routes/api'));
app.use((req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

const PORT=process.env.PORT||3000;
initDb().then(()=>{
  app.listen(PORT,'0.0.0.0',()=>console.log('Alto E corriendo en puerto '+PORT));
}).catch(err=>{
  console.error('Error iniciando DB:',err);
  process.exit(1);
});
