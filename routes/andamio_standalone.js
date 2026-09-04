router.get('/andamio-urgente/reporte', chequearClave, async (req, res) => {
  try {
    const pool = getDb();
    const { desde, hasta } = req.query;
    if (!desde || !hasta) return res.status(400).json({ error: 'Faltan fecha/hora desde/hasta' });

    const { rows } = await pool.query(
      `SELECT * FROM comprobantes_transferencia
       WHERE sucursal_id=$1
         AND fecha_hora >= $2::timestamptz
         AND fecha_hora <= $3::timestamptz
       ORDER BY fecha_hora ASC`,
      [SUCURSAL_ID_ANDAMIO, desde, hasta]
    );

    const totales = rows.reduce((acc, c) => {
      acc.cantidad++;
      acc.total += parseFloat(c.monto);
      if (c.estado === 'verificado') { acc.verificados++; acc.totalVerificado += parseFloat(c.monto); }
      else if (c.estado === 'sin_matchear') acc.sinMatchear++;
      else if (c.estado === 'revisar_manual') acc.revisarManual++;
      else acc.pendientes++;
      return acc;
    }, { cantidad:0, total:0, verificados:0, totalVerificado:0, sinMatchear:0, revisarManual:0, pendientes:0 });

    res.json({ comprobantes: rows, totales, desde, hasta });
  } catch (err) {
    console.error('Error generando reporte:', err);
    res.status(500).json({ error: 'Error al generar el informe' });
  }
});
