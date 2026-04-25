async function importarExcel(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=async(e)=>{
    try{
      const wb=XLSX.read(e.target.result,{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      // Buscar fila de encabezado
      let headerRow=-1;
      for(let i=0;i<Math.min(rows.length,10);i++){
        const r=rows[i].map(c=>String(c).toLowerCase());
        if(r.some(c=>c.includes('apellido')||c.includes('nombre'))){headerRow=i;break;}
      }
      if(headerRow===-1){toast('No se encontró fila de encabezado',false);return;}
      const headers=rows[headerRow].map(h=>String(h).toLowerCase().trim());
      const col=(...names)=>headers.findIndex(h=>names.some(n=>h.includes(n)));
      const iNom=col('apellido','nombre');
      const iDni=col('dni');
      const iCel=col('cel');
      const iTel=col('tel');
      const iDom=col('domicilio');
      const iTrab=col('trabaja');
      const iMod=col('modalidad','categor');
      const iIngreso=col('ingreso','fecha');
      const iTipo=col('tipo');
      const iMarca=col('marca');
      const iModelo=col('modelo');
      const iColor=col('color');
      const iPatente=col('patente','letra');
      const clientes=[];
      for(let i=headerRow+1;i<rows.length;i++){
        const r=rows[i];
        const nombre=String(r[iNom]||'').trim();
        if(!nombre)continue;
        // Mapear modalidad
        const modRaw=String(r[iMod]||'').toLowerCase().trim();
        let modalidad='mensual';
        if(modRaw.includes('24'))modalidad='mensual24';
        else if(modRaw.includes('t1')||modRaw.includes('turno 1')||modRaw.includes('turno1'))modalidad='turno1';
        else if(modRaw.includes('t2')||modRaw.includes('turno 2')||modRaw.includes('turno2'))modalidad='turno2';
        else if(modRaw.includes('noc'))modalidad='nocturno';
        else if(modRaw.includes('parcial'))modalidad='parcial';
        else if(modRaw.includes('comercial')||modRaw.includes('mensual'))modalidad='mensual';
        // Mapear tipo de vehículo
        const tipoRaw=String(r[iTipo]||'').toLowerCase().trim();
        let tipo='auto';
        if(tipoRaw.includes('moto'))tipo='moto';
        else if(tipoRaw.includes('cam'))tipo='camioneta';
        else if(tipoRaw.includes('trafic'))tipo='trafic';
        // Fecha de ingreso
        let ingreso='';
        if(r[iIngreso]){
          const d=new Date(r[iIngreso]);
          if(!isNaN(d))ingreso=d.toISOString().slice(0,10);
        }
        clientes.push({
          nombre,
          dni:String(r[iDni]||'').trim(),
          cel:String(r[iCel]||'').trim(),
          tel:String(r[iTel]||'').trim(),
          dom:String(r[iDom]||'').trim(),
          trabajo:String(r[iTrab]||'').trim(),
          modalidad,
          ingreso,
          vehiculo1_tipo:tipo,
          vehiculo1_marca:String(r[iMarca]||'').trim(),
          vehiculo1_modelo:String(r[iModelo]||'').trim(),
          vehiculo1_color:String(r[iColor]||'').trim(),
          vehiculo1_patente:String(r[iPatente]||'').trim().toUpperCase()
        });
      }
      if(!clientes.length){toast('No se encontraron clientes',false);return;}
      mostrarPreviewImport(clientes);
    }catch(err){toast('Error: '+err.message,false);}
  };
  reader.readAsArrayBuffer(file);
  input.value='';
}
