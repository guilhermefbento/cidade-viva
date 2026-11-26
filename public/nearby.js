import { fallbackMap } from './map-fallback.js';

const places = [
  ['Praça da Sé', -23.5503, -46.6339],
  ['MASP, Avenida Paulista', -23.5614, -46.6559],
  ['Estação Santana', -23.5025, -46.6255],
  ['Estação Itaquera', -23.5422, -46.4711],
  ['Largo da Batata', -23.5669, -46.6935],
  ['Largo Treze de Maio', -23.6545, -46.7093],
];

export function connectNearby({ $, api, element, statuses }) {
  const place = $('#near-place'), radius = $('#near-radius'), status = $('#near-status');
  const result = $('#near-results'), feedback = $('#near-feedback');
  const gps = $('#near-gps'), gpsNote = $('#near-gps-note');
  let map, layer, device, version = 0, locationRequest = 0;
  places.forEach(([name], i) => place.add(new Option(name, i)));
  function draw(center, distance, reports) {
    if (!window.L) return;
    map ??= fallbackMap($('#near-map'));
    map.invalidateSize();
    layer?.remove();
    layer = L.featureGroup().addTo(map);
    const circle = L.circle(center, {radius:distance, color:'#c6fa55', weight:2, fillOpacity:.08}).addTo(layer);
    L.circleMarker(center, {radius:5, color:'white', fillColor:'#152d36', fillOpacity:1}).addTo(layer);
    for (const item of reports) {
      const link = element('a', item.titulo);
      link.href = '#ocorrencia/' + item.id;
      L.circleMarker([item.latitude,item.longitude], {radius:7,color:'#18383c',fillColor:'#c6fa55',fillOpacity:1})
        .bindPopup(link).addTo(layer);
    }
    map.fitBounds(circle.getBounds(), {padding:[12,12],animate:false});
  }
  async function refresh() {
    const own = ++version;
    const center = place.value === 'device' ? device : places[place.selectedIndex].slice(1);
    const distance = Number(radius.value);
    result.replaceChildren();
    layer?.remove();
    feedback.textContent = 'Buscando ocorrências…';
    try {
      const params = new URLSearchParams({lat:center[0],lng:center[1],raio:distance,status:status.value});
      const data = await api('/proximas?' + params);
      if (own !== version) return;
      draw(center, distance, data.ocorrencias);
      const n = data.ocorrencias.length;
      feedback.textContent = data.mais ? 'Exibindo as 30 ocorrências mais próximas.' : n ? n + (n===1 ? ' ocorrência encontrada.' : ' ocorrências encontradas.') : 'Nenhum relato neste raio com os filtros escolhidos.';
      for (const item of data.ocorrencias) {
        const link = element('a',null,'near-report');
        link.href = '#ocorrencia/' + item.id;
        const meters = Math.round(item.distancia);
        link.append(element('small',item.categoria+' · '+statuses[item.status]),element('strong',item.titulo),
          element('span',item.endereco),element('b',meters.toLocaleString('pt-BR')+' m ↗'));
        result.append(link);
      }
    } catch (error) {
      if (own === version) feedback.textContent = error.message;
    }
  }
  place.onchange = () => { locationRequest++; gps.disabled=false; gpsNote.textContent=''; refresh(); };
  radius.onchange = status.onchange = refresh;
  gps.onclick = () => {
    if (!navigator.geolocation) { gpsNote.textContent='Localização indisponível. Escolha um ponto de referência.'; return; }
    gps.disabled=true;
    const own=++locationRequest;
    gpsNote.textContent='Consultando sua localização…';
    navigator.geolocation.getCurrentPosition(pos => {
      if(own!==locationRequest) return;
      gps.disabled=false;
      gpsNote.textContent='';
      device=[pos.coords.latitude,pos.coords.longitude];
      if(!place.querySelector('[value="device"]')) place.add(new Option('Minha localização','device'));
      place.value='device';
      refresh();
    }, () => {
      if(own!==locationRequest) return;
      gps.disabled=false;
      gpsNote.textContent='Não foi possível obter sua localização. Escolha um ponto de referência.';
    }, {timeout:10000});
  };
  return refresh;
}