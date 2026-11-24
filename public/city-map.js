import { Map, Marker, NavigationControl, addProtocol } from '/maplibre/maplibre-gl.mjs';

const center=[-46.6991,-23.6127];
const colors={ aberta:'#f6b455', andamento:'#61bbff', resolvida:'#c7f46c' };
const vector = 'https://tiles.openfreemap.org/planet';
const units=2**14;
const middleX=Math.floor((center[0]+180)/360*units);
const middleY=Math.floor((1-Math.asinh(Math.tan(center[1]*Math.PI/180))/Math.PI)/2*units);
let tileCatalog;
async function localOrRemoteTile(request, controller) {
  const [zoom,x,y]=request.url.slice('cidadeviva://'.length).split('/').map(Number);
  const { signal }=controller;
  if (zoom===14 && Math.abs(x-middleX)<=2 && Math.abs(y-middleY)<=2) {
    const local=await fetch('/data/tiles/'+zoom+'/'+x+'/'+y+'.pbf',{signal});
    if (local.ok) return {data:await local.arrayBuffer()};
  }
  tileCatalog ||= fetch(vector).then(response=>{
    if(!response.ok) throw new Error('Cartografia externa indisponível');
    return response.json();
  }).catch(error=>{tileCatalog=undefined;throw error;});
  const catalog=await tileCatalog;
  const url=catalog.tiles[0].replace('{z}',zoom).replace('{x}',x).replace('{y}',y);
  const remote=await fetch(url,{signal});
  if(!remote.ok) throw new Error('Trecho cartográfico indisponível');
  return {data:await remote.arrayBuffer()};
}
addProtocol('cidadeviva',localOrRemoteTile);
const style = {
  version:8,
  light:{anchor:'viewport',position:[1.5,210,45],intensity:.7,color:'#e9e6cb'},
  sources:{ basemap:{type:'vector',tiles:['cidadeviva://{z}/{x}/{y}'],maxzoom:14}, limite:{type:'geojson',data:'/data/sao-paulo.geojson'} },
  layers:[
    {id:'fundo',type:'background',paint:{'background-color':'#182b37'}},
    {id:'verde',type:'fill',source:'basemap','source-layer':'landcover',paint:{'fill-color':'#244238','fill-opacity':.7}},
    {id:'agua',type:'fill',source:'basemap','source-layer':'water',paint:{'fill-color':'#0b253b'}},
    {id:'vias',type:'line',source:'basemap','source-layer':'transportation',paint:{'line-color':'#5c686b','line-width':['interpolate',['linear'],['zoom'],10,.2,16,1.8]}},
    {id:'territorio',type:'fill',source:'limite',paint:{'fill-color':'#c7f46c','fill-opacity':.055}},
    {id:'limite',type:'line',source:'limite',paint:{'line-color':'#c7f46c','line-width':2,'line-dasharray':[2,2]}},
    {id:'predios',type:'fill-extrusion',source:'basemap','source-layer':'building',minzoom:13.8,
      paint:{ 'fill-extrusion-color':'#587780','fill-extrusion-height':['coalesce',['get','render_height'],8],
        'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.86 }},
  ],
};

export function createCityMap(target, openReport) {
  const map=new Map({
    container:target,style,center,zoom:15.15,pitch:54,bearing:-27,
    minZoom:8,maxZoom:19,maxPitch:73,scrollZoom:false,
    maxBounds:[[-47.10,-24.16],[-46.10,-23.12]],
    attributionControl:{compact:true,customAttribution:'<a href="https://openfreemap.org/">OpenFreeMap</a> © OpenMapTiles · <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Limite: IBGE'},
  });
  map.addControl(new NavigationControl({visualizePitch:true}),'bottom-right');
  function onRoadsRendered() {
    if (!map.getLayer('vias') || !map.queryRenderedFeatures({ layers:['vias'] }).length) return;
    map.getContainer().dataset.cartografia='pronta';
    map.off('render',onRoadsRendered);
  }
  map.on('render',onRoadsRendered);
  let markers=[];
  return {
    resize:()=>map.resize(),
    setPlanar(flat) { map.easeTo({pitch:flat?0:54,bearing:flat?0:-27,duration:500}); },
    city() { map.easeTo({ center:[-46.63,-23.70],zoom:9.8,pitch:20,bearing:0 }); },
    bridge() { map.easeTo({ center,zoom:15.15,pitch:54,bearing:-27 }); },
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
      return markers.length;
    },
  };
}
