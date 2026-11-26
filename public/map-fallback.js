const center = [-23.5505,-46.6333];
export function fallbackMap(target) {
  const map=L.map(target,{scrollWheelZoom:false,attributionControl:true,preferCanvas:true}).setView(center,12);
  map.attributionControl.setPrefix(false).addAttribution('Limite: IBGE · vias: OpenFreeMap © OpenMapTiles © OpenStreetMap');
  fetch('/data/sao-paulo.geojson').then(r=>r.json()).then(data=>L.geoJSON(data,{color:'#b6d75c',interactive:false,fillOpacity:.06}).addTo(map)).catch(()=>{});
  fetch('/data/viario-simplificado.geojson').then(r=>r.json()).then(data=>L.geoJSON(data,{
    style:feature=>feature.properties.tipo==='agua'?{color:'#0e2941',weight:1,fillOpacity:.85}:{color:'#83969c',weight:1,opacity:.7},
    interactive:false,
  }).addTo(map)).catch(()=>{});
  map.getContainer().dataset.cartografia='simplificada';
  return map;
}

export function fallbackPicker(target,onSelect) {
  const map=fallbackMap(target);
  let marker;
  map.on('click',({latlng})=>onSelect(latlng.lat,latlng.lng));
  return {
    resize:()=>map.invalidateSize(),
    useCenter(){const point=map.getCenter();onSelect(point.lat,point.lng);},
    setPoint(lat,lng,recenter){
      marker?.remove();
      if(lat==null) return;
      marker=L.marker([lat,lng]).addTo(map);
      if(recenter) map.setView([lat,lng],Math.max(14,map.getZoom()));
    },
  };
}

export function fallbackReports(target,openReport,{fitReports=false}={}) {
  const map=fallbackMap(target);
  const markers=L.featureGroup().addTo(map);
  return {
    resize:()=>map.invalidateSize(),
    bridge:()=>map.setView([-23.6127,-46.6991],14),
    city:()=>map.setView([-23.70,-46.63],10),
    update(reports){
      markers.clearLayers();
      for(const report of reports){
        if(report.latitude==null || report.longitude==null) continue;
        const button=document.createElement('button');
        button.type='button';
        button.textContent='Ver ocorrência';
        button.onclick=()=>openReport(report.id);
        const popup=document.createElement('div');
        const label=document.createElement('p');
        label.textContent=report.titulo;
        popup.append(label,button);
        L.marker([report.latitude,report.longitude],{title:report.titulo,alt:'Ocorrência: '+report.titulo}).bindPopup(popup).addTo(markers);
      }
      if(fitReports&&markers.getLayers().length) map.fitBounds(markers.getBounds(),{padding:[25,25],maxZoom:15});
      return markers.getLayers().length;
    },
  };
}
