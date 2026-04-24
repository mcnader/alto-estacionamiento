// ===== IMPORTAR EXCEL =====
async function importarExcel(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=async(e)=>{
    try{
      const wb=XLSX.read(e.target.result,{type:'array'});
      const sheetName=wb.SheetNames.find(n=>n.toUpperCase().includes('CLIENTE'))||wb.SheetNames[0];
      const ws=wb.Sheets[sheetName];
      const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      let headerRow=-1;
      for(let i=0;i<Math.min(rows.length,10);i++){
        if(rows[i].some(c=>String(c).toLowerCase().includes('apellido'))){headerRow=i;break;}
      }
      if(headerRow===-1){toast('No se encontró columna Apellido',false);return;}
      const headers=rows[headerRow].map(h=>String(h).toLowerCase().trim());
      const col=name=>headers.findIndex(h=>h.includes(name));
      const iApe=col('apellido'),iNom=col('nombre'),iDom=col('domicilio');
      const iTrab=col('trabaja'),iDni=col('dni'),iCel=col('cel'),iTel=col('tel');
      const iCat=col('categor'),iMarca=col('marca'),iMod=col('modelo'),iColor=col('color');
      const iLetra=headers.findIndex(h=>h.includes('letra'));
      const iNum=headers.findIndex(h=>h==='nº'||h==='n°'||h.includes('nº'));
      const clientes=[];
      for(let i=headerRow+1;i<rows.length;i++){
        const r=rows[i];
        const ape=String(r[iApe]||'').trim(),nom=String(r[iNom]||'').trim();
        if(!ape&&!nom)continue;
        const nombre=(ape+' '+nom).trim();
        const patente=((r[iLetra]||'')+' '+(r[iNum]||'')).trim();
        let modalidad=String(r[iCat]||'').trim().toLowerCase();
        if(modalidad.includes('t1'))modalidad='turno1';
        else if(modalidad.includes('t2'))modalidad='turno2';
        else if(modalidad.includes('noc'))modalidad='nocturno';
        else modalidad='mensual';
        const tipoRaw=String(r[iMarca>0?iMarca-1:0]||'').toLowerCase();
        let tipo='auto';
        if(tipoRaw.includes('moto'))tipo='moto';
        else if(tipoRaw.includes('camioneta'))tipo='camioneta';
        else if(tipoRaw.includes('trafic'))tipo='trafic';
        clientes.push({nombre,dom:String(r[iDom]||'').trim(),trabajo:String(r[iTrab]||'').trim(),
          dni:String(r[iDni]||'').trim(),cel:String(r[iCel]||'').trim(),tel:String(r[iTel]||'').trim(),
          modalidad,vehiculo1_tipo:tipo,vehiculo1_marca:String(r[iMarca]||'').trim(),
          vehiculo1_modelo:String(r[iMod]||'').trim(),vehiculo1_color:String(r[iColor]||'').trim(),
          vehiculo1_patente:patente.toUpperCase()});
      }
      if(!clientes.length){toast('No se encontraron clientes',false);return;}
      mostrarPreviewImport(clientes);
    }catch(err){toast('Error: '+err.message,false);}
  };
  reader.readAsArrayBuffer(file);
  input.value='';
}

function mostrarPreviewImport(clientes){
  const rows=clientes.slice(0,5).map(c=>
    '<tr><td>'+c.nombre+'</td><td>'+c.modalidad+'</td><td>'+c.vehiculo1_patente+'</td><td>'+(c.cel||'—')+'</td></tr>'
  ).join('');
  const total=clientes.length;
  document.getElementById('mo-import-preview').innerHTML=
    '<div class="mbox" style="max-width:640px">'+
    '<div class="mt">Importar '+total+' clientes desde Excel</div>'+
    '<p style="font-size:13px;color:var(--text2);margin-bottom:12px">Vista previa de los primeros 5:</p>'+
    '<div class="tw"><table><thead><tr><th>Nombre</th><th>Modalidad</th><th>Patente</th><th>Celular</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    (total>5?'<p style="font-size:12px;color:var(--text3);margin-top:8px">... y '+(total-5)+' más</p>':'')+
    '<div style="background:#fef3db;border:1px solid #e8c97a;border-radius:8px;padding:10px 12px;margin-top:12px;font-size:12px;color:var(--am)">Los clientes que ya existen no se duplicarán.</div>'+
    '<div class="mf">'+
    '<button class="btn" onclick="closeMo(\'mo-import-preview\')">Cancelar</button>'+
    '<button class="btn btn-p" onclick="confirmarImport(window._importData)">Importar '+total+' clientes</button>'+
    '</div></div>';
  window._importData=clientes;
  openMo('mo-import-preview');
}

async function confirmarImport(clientes){
  closeMo('mo-import-preview');
  let ok=0,skip=0;
  const exist=new Set(CLIS.map(c=>c.nombre.toLowerCase()));
  for(const c of clientes){
    if(exist.has(c.nombre.toLowerCase())){skip++;continue;}
    try{await api('POST','/api/clientes',c);ok++;}catch(e){skip++;}
  }
  CLIS=await api('GET','/api/clientes');
  renderClientes();
  toast('Importados '+ok+' clientes'+(skip?' · '+skip+' omitidos':''));
}

// ===== EXPORTAR EXCEL =====
function exportarMenu(){
  document.getElementById('mo-export').innerHTML=
    '<div class="mbox" style="max-width:420px">'+
    '<div class="mt">Exportar a Excel</div>'+
    '<p style="font-size:13px;color:var(--text2);margin-bottom:16px">Elegí qué exportar:</p>'+
    '<div style="display:flex;flex-direction:column;gap:8px">'+
    '<button class="btn" style="justify-content:flex-start" onclick="exportClientes()">Lista de clientes activos</button>'+
    '<button class="btn" style="justify-content:flex-start" onclick="exportPagosMes()">Pagos del mes actual</button>'+
    '<button class="btn" style="justify-content:flex-start" onclick="exportResumenAnual()">Resumen anual</button>'+
    '<button class="btn" style="justify-content:flex-start" onclick="exportDeudores()">Deudores del mes</button>'+
    '<button class="btn" style="justify-content:flex-start" onclick="exportTodoPagos()">Todos los pagos (historial)</button>'+
    '</div>'+
    '<div class="mf"><button class="btn" onclick="closeMo(\'mo-export\')">Cerrar</button></div>'+
    '</div>';
  openMo('mo-export');
}

function xlsxDescargar(data,cols,nombre){
  const ws=XLSX.utils.json_to_sheet(data);
  ws['!cols']=cols.map(c=>({wch:c}));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Datos');
  XLSX.writeFile(wb,nombre+'_'+new Date().toISOString().slice(0,10)+'.xlsx');
}

async function exportClientes(){
  closeMo('mo-export');
  const data=CLIS.filter(c=>c.activo).map(c=>({
    'Nombre':c.nombre,'Modalidad':nomMod(c.modalidad),'Celular':c.cel||'',
    'Tel referencia':c.tel||'','DNI':c.dni||'','Domicilio':c.dom||'',
    'Trabaja en':c.trabajo||'','Vehículo':labVeh(c.vehiculo1_tipo),
    'Marca':c.vehiculo1_marca||'','Modelo':c.vehiculo1_modelo||'',
    'Color':c.vehiculo1_color||'','Patente 1':c.vehiculo1_patente||'',
    'Patente 2':c.vehiculo2_patente||'','Ingreso':c.ingreso||''
  }));
  xlsxDescargar(data,[25,15,15,15,12,25,20,10,15,15,10,12,12,12],'clientes');
  toast('Excel de clientes descargado');
}

async function exportPagosMes(){
  closeMo('mo-export');
  const mes=new Date().toISOString().slice(0,7);
  const pagos=await api('GET','/api/pagos?mes='+mes);
  const data=pagos.map(p=>({
    'Fecha':p.fecha,'Cliente':p.cliente_nombre||'','Mes':p.mes,
    'Importe esperado':parseFloat(p.importe_esperado),
    'Importe abonado':parseFloat(p.importe_abonado),
    'Efectivo':parseFloat(p.monto_efectivo||0),
    'Transferencia':parseFloat(p.monto_transferencia||0),
    'Forma':p.forma_pago,'Encargado':p.encargado_nombre||'','Obs':p.obs||''
  }));
  xlsxDescargar(data,[12,25,10,16,16,12,14,12,15,30],'pagos_'+mes);
  toast('Excel de pagos descargado');
}

async function exportResumenAnual(){
  closeMo('mo-export');
  const anio=new Date().getFullYear().toString();
  const resp=await api('GET','/api/resumen?anio='+anio);
  const ME=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const data=resp.clientes.map(c=>{
    const fila={'Cliente':c.nombre};let total=0;
    for(let m=1;m<=12;m++){
      const mk=anio+'-'+String(m).padStart(2,'0');
      const pp=resp.pagos.find(p=>p.cliente_id==c.id&&p.mes===mk);
      const v=pp?parseFloat(pp.total):0;
      fila[ME[m-1]]=v||'';total+=v;
    }
    fila['Total']=total;return fila;
  });
  xlsxDescargar(data,[25,...Array(12).fill(10),12],'resumen_'+anio);
  toast('Resumen anual descargado');
}

async function exportDeudores(){
  closeMo('mo-export');
  const mes=new Date().toISOString().slice(0,7);
  const deudores=await api('GET','/api/deudores?mes='+mes);
  const data=deudores.map(d=>({
    'Cliente':d.nombre,'Modalidad':nomMod(d.modalidad),
    'Patente':d.vehiculo1_patente||'','Celular':d.cel||'',
    'Abonado':d.abonado,'Esperado':d.esperado,'Deuda':d.deuda,
    'Estado':d.sin_pago?'Sin pago':'Pago parcial'
  }));
  xlsxDescargar(data,[25,15,12,15,12,12,12,14],'deudores_'+mes);
  toast('Excel de deudores descargado');
}

async function exportTodoPagos(){
  closeMo('mo-export');
  toast('Preparando historial...');
  const pagos=await api('GET','/api/pagos');
  const data=pagos.map(p=>({
    'Fecha':p.fecha,'Mes':p.mes,'Cliente':p.cliente_nombre||'',
    'Importe esperado':parseFloat(p.importe_esperado),
    'Importe abonado':parseFloat(p.importe_abonado),
    'Efectivo':parseFloat(p.monto_efectivo||0),
    'Transferencia':parseFloat(p.monto_transferencia||0),
    'Forma':p.forma_pago,'Encargado':p.encargado_nombre||'',
    'Obs':p.obs||'','Anulado':p.anulado?'Si':'No'
  }));
  xlsxDescargar(data,[12,10,25,16,16,12,14,12,15,30,8],'historial_pagos');
  toast('Historial descargado');
}
