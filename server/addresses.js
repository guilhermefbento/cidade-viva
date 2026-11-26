const photon = 'https://photon.komoot.io';
const cache = new Map();
const pending = new Map();
let queue = Promise.resolve();
let lastLookup = 0;

function lookup(path, params) {
  const url = photon + path + '?' + params;
  const cached = cache.get(url);
  if (cached && cached.until > Date.now()) return Promise.resolve(cached.features);
  if (pending.has(url)) return pending.get(url);
  if (pending.size >= 6) return Promise.reject(new Error('Fila de consultas cheia'));
  const request = queue.then(async () => {
    const pause = 1050 - (Date.now() - lastLookup);
    if (pause > 0) await new Promise(resolve => setTimeout(resolve,pause));
    lastLookup = Date.now();
    const response = await fetch(url,{
      redirect:'error', signal:AbortSignal.timeout(4500),
      headers:{Accept:'application/json','User-Agent':'CidadeViva-SP/2.2 (github.com/guilhermefbento/cidade-viva)'},
    });
    if(!response.ok) throw new Error('Serviço de endereço indisponível');
    const body = await response.json();
    const features = Array.isArray(body.features) ? body.features : [];
    if(cache.size>=120) cache.delete(cache.keys().next().value);
    cache.set(url,{features,until:Date.now()+300000});
    return features;
  }).finally(() => pending.delete(url));
  pending.set(url,request);
  queue=request.catch(()=>{});
  return request;
}

const asText = value => typeof value==='string' ? value.trim() : '';
const normal = value => asText(value).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
function addressFrom(feature,inside,omitNumber=false) {
  if(feature?.geometry?.type!=='Point') return null;
  const [longitude,latitude] = feature.geometry.coordinates ?? [];
  if(!inside(latitude,longitude)) return null;
  const p=feature.properties??{};
  const street=asText(p.street) || (p.type==='street' ? asText(p.name) : '');
  const name=asText(p.name);
  const place=street || name;
  const number=omitNumber ? '' : asText(p.housenumber);
  const district=asText(p.district)||asText(p.locality);
  if(!place || ['city','county','state','country'].includes(p.type)) return null;
  const label=[place,number,district,'São Paulo'].filter(Boolean).join(', ').slice(0,250);
  return {latitude,longitude,endereco:label,logradouro:street,numero:number};
}
function streetWords(value) {
  const noise=new Set(['rua','r','avenida','av','alameda','al','travessa','trav','praca','de','da','do','das','dos']);
  return normal(value).split(/[^a-z0-9]+/).filter(word=>word&&!noise.has(word));
}
function publicAddress({latitude,longitude,endereco}, aproximado) {
  return {latitude,longitude,endereco,aproximado};
}

export function registerAddressRoutes(app,{inside,requireUser,fail}) {
  app.get('/api/endereco/busca',requireUser,async (req,res) => {
    const input=asText(req.query.q).replace(/\s+/g,' ');
    if(input.length<4 || input.length>220) fail(400,'Digite de 4 a 220 caracteres para buscar o endereço.');
    const params=new URLSearchParams({
      q:/s[aã]o paulo/i.test(input)?input:input+', São Paulo', bbox:'-47.10,-24.16,-46.10,-23.12',
      countrycode:'BR',lat:'-23.55',lon:'-46.63',lang:'default',limit:'12',
    });
    let features;
    try { features=await lookup('/api/',params); }
    catch { return res.status(502).json({erro:'A busca está indisponível. Marque o local no mapa.'}); }
    let items=features.map(feature=>addressFrom(feature,inside)).filter(Boolean);
    const numbered=/^(.+?)(?:,\s*|\s+)(\d+[a-z]?)(?=,|$)/i.exec(input);
    if(numbered) {
      const words=streetWords(numbered[1]);
      if(words.length) items=items.filter(item=>{
        const terms=streetWords(item.logradouro);
        return words.every(word=>terms.includes(word));
      });
      const exact=items.filter(item=>normal(item.numero)===normal(numbered[2]));
      if(exact.length) items=exact;
      else items=items.map(item=>({...item,numero:'',endereco:item.endereco.replace(/,\s*\d+[a-z]?(?=,|$)/i,'')}));
    }
    const seen = new Set();
    const unique = items.filter(item => {
      const key = normal(item.endereco);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    res.json({resultados:unique.slice(0,5).map(item=>publicAddress(item,!item.numero))});
  });

  app.get('/api/endereco/ponto',requireUser,async (req,res) => {
    const lat=asText(req.query.lat), lng=asText(req.query.lng);
    const latitude=Number(lat), longitude=Number(lng);
    if(!lat||!lng||!inside(latitude,longitude)) fail(400,'Escolha um ponto dentro do município de São Paulo.');
    const params=new URLSearchParams({lat:latitude.toFixed(6),lon:longitude.toFixed(6),lang:'default',radius:'0.16',limit:'5'});
    params.append('layer','street');
    params.append('layer','house');
    let features;
    try { features=await lookup('/reverse',params); }
    catch { return res.status(502).json({erro:'Não foi possível encontrar o endereço do ponto marcado.'}); }
    for (const feature of features) {
      const item=addressFrom(feature,inside,true);
      if(item?.logradouro) return res.json({resultado:publicAddress(item,true)});
    }
    res.json({resultado:null});
  });
}
