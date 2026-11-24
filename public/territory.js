// GeoJSON do IBGE, município 3550308. Coordenadas no formato longitude, latitude.
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [a, b] = ring[i], [c, d] = ring[j];
    const cross = (x - a) * (d - b) - (y - b) * (c - a);
    if (Math.abs(cross) < 1e-12 && x >= Math.min(a,c) && x <= Math.max(a,c) && y >= Math.min(b,d) && y <= Math.max(b,d)) return true;
    if ((b > y) !== (d > y) && x < (c - a) * (y - b) / (d - b) + a) inside = !inside;
  }
  return inside;
}
export function containsPoint(geojson, latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  const geometries = geojson.type === 'FeatureCollection' ? geojson.features.map(f => f.geometry) : [geojson.geometry || geojson];
  return geometries.some(geometry => {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
    return polygons.some(rings => inRing(longitude, latitude, rings[0]) && !rings.slice(1).some(ring => inRing(longitude, latitude, ring)));
  });
}
