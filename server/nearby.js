export function registerNearby(app, db, { rows, fail, scope, inSaoPaulo }) {
  app.get('/api/proximas', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { lat, lng, raio, status = '' } = req.query;
    const latitude = Number(lat), longitude = Number(lng);
    if (![lat, lng].every(v => typeof v === 'string' && v.trim()) || !inSaoPaulo(latitude, longitude))
      fail(400, 'Escolha um ponto dentro da cidade de São Paulo.');
    if (!['150', '500', '1000', '3000'].includes(raio) || !['', 'aberta', 'andamento', 'resolvida', 'pendentes'].includes(status))
      fail(400, 'Escolha uma distância e um status disponíveis.');
    const category = req.query.categoria;
    if (category !== undefined && (typeof category !== 'string' || !/^[1-9]\d{0,8}$/.test(category)))
      fail(400, 'Categoria inválida.');
    const radius = Number(raio);
    const dy = radius / 110000;
    const dx = dy / Math.cos(latitude * Math.PI / 180);
    const reports = await rows(db, `SELECT p.id, p.titulo, p.categoria, p.status, p.latitude, p.longitude, p.endereco,
        ST_Distance_Sphere(POINT(p.longitude,p.latitude),POINT(?,?)) AS distancia
      FROM painel_ocorrencias p WHERE ${scope}
        AND p.latitude BETWEEN ? AND ? AND p.longitude BETWEEN ? AND ?
        ${category ? 'AND p.categoria_id=?' : ''}
        ${status === 'pendentes' ? "AND p.status IN ('aberta','andamento')" : status ? 'AND p.status=?' : ''}
      HAVING distancia <= ? ORDER BY distancia, p.id DESC LIMIT 31`,
      [longitude, latitude, latitude-dy, latitude+dy, longitude-dx, longitude+dx, ...(category ? [Number(category)] : []), ...(status && status !== 'pendentes' ? [status] : []), radius]);
    res.json({ ocorrencias: reports.slice(0, 30), mais: reports.length > 30 });
  });
}