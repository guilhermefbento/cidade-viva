import { Map, Marker, NavigationControl, addProtocol } from '/maplibre/maplibre-gl.mjs';

const bridge=[-46.6991,-23.6127];
export const downtown=[-46.6333,-23.5505];
const colors={ aberta:'#f6b455', andamento:'#61bbff', resolvida:'#c7f46c' };
const vector = 'https://tiles.openfreemap.org/planet';
const localAreas = [{zoom:14,x:6066,y:9298,radius:2},{zoom:14,x:6069,y:9295,radius:1},{zoom:12,x:1517,y:2323,radius:1}];
let tileCatalog;
async function localOrRemoteTile(request, controller) {
  const [zoom,x,y]=request.url.slice('cidadeviva://'.length).split('/').map(Number);
  const { signal }=controller;
  if (localAreas.some(area=>area.zoom===zoom && Math.abs(x-area.x)<=area.radius && Math.abs(y-area.y)<=area.radius)) {
    const local=await fetch('/data/tiles/'+zoom+'/'+x+'/'+y+'.pbf',{signal});
    if (local.ok) return {data:await local.arrayBuffer()};
  }
  try {
    tileCatalog ||= fetch(vector,{signal:AbortSignal.timeout(6000)}).then(response=>{
      if(!response.ok) throw new Error('Cartografia externa indisponível');
      return response.json();
    }).catch(error=>{tileCatalog=undefined;throw error;});
    const catalog=await tileCatalog;
    const url=catalog.tiles[0].replace('{z}',zoom).replace('{x}',x).replace('{y}',y);
    const remote=await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(9000)])});
    if(!remote.ok) throw new Error('Trecho cartográfico indisponível');
    return {data:await remote.arrayBuffer()};
  } catch(error) {
    if(signal.aborted) throw error;
    // An empty vector tile keeps the municipal outline and local map visible offline.
    return {data:new ArrayBuffer(0)};
  }
}
addProtocol('cidadeviva',localOrRemoteTile);
const style = {
  version:8,
  glyphs:location.origin+'/data/map-fonts/{fontstack}/{range}.pbf',
  light:{anchor:'viewport',position:[1.5,210,45],intensity:.7,color:'#e9e6cb'},
  sources:{ basemap:{type:'vector',tiles:['cidadeviva://{z}/{x}/{y}'],maxzoom:14}, limite:{type:'geojson',data:'/data/sao-paulo.geojson'} },
  layers:[
    {id:'fundo',type:'background',paint:{'background-color':'#182b37'}},
    {id:'verde',type:'fill',source:'basemap','source-layer':'landcover',paint:{'fill-color':'#244238','fill-opacity':.7}},
    {id:'agua',type:'fill',source:'basemap','source-layer':'water',paint:{'fill-color':'#0b253b'}},
    {id:'vias',type:'line',source:'basemap','source-layer':'transportation',paint:{'line-color':'#5c686b','line-width':['interpolate',['linear'],['zoom'],10,.2,16,1.8]}},
    {id:'territorio',type:'fill',source:'limite',paint:{'fill-color':'#c7f46c','fill-opacity':.055}},
    {id:'limite',type:'line',source:'limite',paint:{'line-color':'#c7f46c','line-width':2,'line-dasharray':[2,2]}},
    {id:'ruas-nomes',type:'symbol',source:'basemap','source-layer':'transportation_name',minzoom:13,
      layout:{'symbol-placement':'line','text-field':['coalesce',['get','name:pt'],['get','name']],'text-font':['Noto Sans Regular'],'text-size':11},
      paint:{'text-color':'#cad9d9','text-halo-color':'#192e38','text-halo-width':1.4}},
    {id:'predios',type:'fill-extrusion',source:'basemap','source-layer':'building',minzoom:13.8,
      paint:{ 'fill-extrusion-color':'#587780','fill-extrusion-height':['coalesce',['get','render_height'],8],
        'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.86 }},
  ],
};

function streetMap(target, flat) {
  const map=new Map({
    container:target,style:flat?{...style,layers:style.layers.filter(layer=>layer.id!=='predios')}:style,
    center:flat?downtown:bridge,zoom:flat?14:15.15,pitch:flat?0:54,bearing:flat?0:-27,
    minZoom:8,maxZoom:19,maxPitch:flat?0:73,scrollZoom:false,dragRotate:!flat,pitchWithRotate:!flat,
    maxBounds:[[-47.10,-24.16],[-46.10,-23.12]],
    attributionControl:{compact:true,customAttribution:'<a href="https://openfreemap.org/">OpenFreeMap</a> © OpenMapTiles · <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Limite: IBGE'},
  });
  map.addControl(new NavigationControl({visualizePitch:!flat}),'top-right');
  const container=map.getContainer();
  function updateCoverage() {
    if (!map.getLayer('vias')) return;
    container.dataset.cartografia=map.queryRenderedFeatures({layers:['vias']}).length?'pronta':'parcial';
  }
  map.on('idle',updateCoverage);
  return map;
}

export function createLocationMap(target,onSelect) {
  const map=streetMap(target,true);
  const marker=new Marker({color:'#c7f46c'});
  map.on('click',event=>onSelect(event.lngLat.lat,event.lngLat.lng));
  return {
    resize:()=>map.resize(),
    useCenter(){const point=map.getCenter();onSelect(point.lat,point.lng);},
    setPoint(lat,lng,recenter){
      marker.remove();
      if(lat==null) return;
      marker.setLngLat([lng,lat]).addTo(map);
      if(recenter) map.jumpTo({center:[lng,lat],zoom:Math.max(14,map.getZoom())});
    },
  };
}

export function createCityMap(target,openReport,{flat=false,fitReports=false}={}) {
  const map=streetMap(target,flat);
  let markers=[];
  return {
    resize:()=>map.resize(),
    setPlanar(flat) { map.easeTo({pitch:flat?0:54,bearing:flat?0:-27,duration:500}); },
    city() { map.easeTo({ center:[-46.63,-23.70],zoom:9.8,pitch:20,bearing:0 }); },
    bridge() { map.easeTo({ center:bridge,zoom:15.15,pitch:54,bearing:-27 }); },
    update(reports) {
      for (const marker of markers) marker.remove();
      markers=reports.filter(r=>r.latitude!=null&&r.longitude!=null).map(report=>{
        const button=document.createElement('button');
        button.type='button';
        button.className='report-pin';
        button.style.setProperty('--pin',colors[report.status]||colors.aberta);
        button.title=report.titulo;
        button.setAttribute('aria-label','Abrir ocorrência: '+report.titulo);
        button.addEventListener('click',()=>openReport(report.id));
        return new Marker({element:button,anchor:'bottom'}).setLngLat([report.longitude,report.latitude]).addTo(map);
      });
      if(fitReports && markers.length) {
        const points=markers.map(marker=>marker.getLngLat());
        map.fitBounds([
          [Math.min(...points.map(p=>p.lng)),Math.min(...points.map(p=>p.lat))],
          [Math.max(...points.map(p=>p.lng)),Math.max(...points.map(p=>p.lat))],
        ],{padding:46,maxZoom:15,duration:0});
      }
      return markers.length;
    },
  };
}
