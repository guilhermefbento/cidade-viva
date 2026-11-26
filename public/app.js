import { connectAddress } from './address.js';
import { protocol } from './tracking.js';
import { containsPoint } from './territory.js';
import { connectPortal } from './portal.js';
const $ = selector => document.querySelector(selector);
const statuses = { aberta: 'Aberta', andamento: 'Em andamento', resolvida: 'Resolvida' };
let territory;
let portal;
const reportForm = $('#report-form');
const filters = $('#filters');
const authForm = $('#auth-form');
let user, signup = false, afterAuth, pickMap, pickerPromise, reportMapPromise;
let categoryOptions = [];
let reports = [], page = 0, request = 0, detailRequest = 0;
const date = value => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
function element(tag, content, style) {
  const node = document.createElement(tag);
  if (content != null) node.textContent = content;
  if (style) node.className = style;
  return node;
}
function button(label, handler, style = 'quiet') {
  const node = element('button', label, style);
  node.type = 'button';
  node.onclick = handler;
  return node;
}
async function api(path, method = 'GET', body) {
  const options = { method };
  if (body instanceof FormData) options.body = body;
  else if (body) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }
  let response, data;
  try {
    response = await fetch('/api' + path, options);
    if (response.status === 204) return;
    data = await response.json();
  } catch {
    throw new Error('Não foi possível conectar ao Cidade Viva. Tente novamente.');
  }
  if (!response.ok) throw new Error(data.erro || 'Não foi possível carregar os dados. Tente novamente.');
  return data;
}
function error(container, message = '') {
  const node = container.querySelector('.error');
  node.hidden = !message;
  node.textContent = message;
}
function notice(message = '') {
  $('#notice').textContent = message;
  $('#notice').hidden = !message;
}
async function submit(form, work) {
  error(form);
  const submitButton = Array.from(form.elements).find(control => control instanceof HTMLButtonElement && control.type === 'submit');
  submitButton.disabled = true;
  try { await work(); } catch (failure) { error(form, failure.message); }
  finally { submitButton.disabled = false; }
}
document.querySelectorAll('dialog .close').forEach(b => b.onclick = () => b.closest('dialog').close());
function setUser(value) {
  user = value;
  portal?.onUser(user);
  $('#account').textContent = user ? user.nome + (user.papel === 'admin' ? ' · Admin' : '') : '';
  $('#auth').textContent = user ? 'Sair' : 'Entrar';
}
function setAuthMode(mode) {
  signup = mode;
  $('#auth-title').textContent = signup ? 'Criar conta' : 'Entrar';
  $('#auth-submit').textContent = signup ? 'Criar conta' : 'Entrar';
  $('#auth-mode').textContent = signup ? 'Já tenho conta' : 'Criar conta';
  $('#name-field').hidden = !signup;
  authForm.elements.nome.required = signup;
  authForm.elements.senha.minLength = signup ? 8 : 0;
  authForm.elements.senha.autocomplete = signup ? 'new-password' : 'current-password';
  error(authForm);
}
function openAuth(callback) {
  afterAuth = callback;
  authForm.reset();
  setAuthMode(false);
  $('#auth-dialog').showModal();
}
$('#auth-mode').onclick = () => setAuthMode(!signup);
$('#auth').onclick = async () => {
  if (!user) return openAuth();
  try {
    await api('/sair', 'POST');
    setUser(null);
    if (portal.scope()) location.hash='explorar';
    else await load();
    notice('Você saiu da conta.');
  } catch (failure) { notice(failure.message); }
};
authForm.onsubmit = event => {
  event.preventDefault();
  submit(authForm, async () => {
    const result = await api(signup ? '/cadastro' : '/login', 'POST', Object.fromEntries(new FormData(authForm)));
    setUser(result.usuario);
    $('#auth-dialog').close();
    const callback = afterAuth;
    afterAuth = undefined;
    if (callback) await callback();
    await load();
  });
};
async function preparePicker() {
  if (!pickerPromise) {
    const container = $('#pick-map');
    const select = (lat,lng) => setPoint(lat.toFixed(6),lng.toFixed(6));
    pickerPromise = import('./city-map.js').then(module => module.createLocationMap(container,select)).catch(async () => {
      const crosshair=container.querySelector('.map-crosshair');
      container.replaceChildren(crosshair);
      const { fallbackPicker } = await import('./map-fallback.js');
      return fallbackPicker(container,select);
    }).catch(() => null);
  }
  pickMap = await pickerPromise;
  if (!$('#create-dialog').open) return;
  $('#mark-center').disabled = !pickMap;
  if (!pickMap) {
    $('#map-coverage').textContent = 'Não foi possível abrir o mapa. Use sua localização ou informe as coordenadas.';
    return;
  }
  pickMap.resize();
  syncPin();
}
let suggestionVersion = 0;
let suggestionTimer;
let locationVersion = 0;
function updateSuggestions(valid) {
  const version = ++suggestionVersion;
  clearTimeout(suggestionTimer);
  const panel = $('#similar-reports');
  panel.hidden = true;
  const {latitude,longitude,categoria_id} = reportForm.elements;
  if (!valid || !categoria_id.value || !$('#create-dialog').open) return;
  const query = new URLSearchParams({lat:latitude.value,lng:longitude.value,categoria:categoria_id.value,raio:'150',status:'pendentes'});
  suggestionTimer = setTimeout(async () => {
    try {
      const {ocorrencias} = await api('/proximas?' + query);
      if (version !== suggestionVersion || !$('#create-dialog').open) return;
      const items = ocorrencias.slice(0,3).map(report => {
        const item = button('', () => detail(report.id), 'similar-item');
        item.append(element('strong',report.titulo),element('small',statuses[report.status]+' · '+Math.round(report.distancia)+' m ↗'));
        return item;
      });
      $('#similar-list').replaceChildren(...items);
      panel.hidden = !items.length;
    } catch { /* A consulta complementar pode falhar sem impedir a publicação. */ }
  },250);
}
reportForm.elements.categoria_id.addEventListener('change',()=>syncPin());
function syncPin(recenter = false) {
  const { latitude, longitude } = reportForm.elements;
  const lat=Number(latitude.value), lng=Number(longitude.value);
  const complete=latitude.value!=='' && longitude.value!=='';
  const valid=complete && latitude.validity.valid && longitude.validity.valid && territory && containsPoint(territory,lat,lng);
  updateSuggestions(valid);
  pickMap?.setPoint(valid?lat:null,valid?lng:null,recenter);
  $('#point-feedback').textContent = valid ? 'Local marcado no mapa.' : complete ? 'Essas coordenadas estão fora da cidade de São Paulo.' : 'Nenhum local marcado.';
  return Boolean(valid);
}
function selectPoint(lat,lng,recenter=false) {
  locationVersion++;
  const invalid = lat!=null && (!territory || !containsPoint(territory,Number(lat),Number(lng)));
  reportForm.elements.latitude.value = invalid || lat==null ? '' : Number(lat).toFixed(6);
  reportForm.elements.longitude.value = invalid || lng==null ? '' : Number(lng).toFixed(6);
  syncPin(recenter&&!invalid);
  return !invalid;
}
const linkedAddress = connectAddress(reportForm,{selectPoint});
function setPoint(lat,lng,recenter=false) {
  if (!selectPoint(lat,lng,recenter)) {
    linkedAddress.clear();
    error(reportForm,'Escolha um local dentro da cidade de São Paulo.');
    return;
  }
  error(reportForm);
  if (lat==null || lng==null) linkedAddress.clear();
  else linkedAddress.point(lat,lng);
}
function createReport() {
  if (!user) return openAuth(createReport);
  reportForm.reset();
  linkedAddress.clear();
  clearPhoto();
  error(reportForm);
  $('#create-dialog').showModal();
  syncPin();
  preparePicker();
}
$('#create').onclick = createReport;
$('#mark-center').onclick = () => pickMap?.useCenter();
$('#clear-location').onclick = () => setPoint(null, null);
for (const name of ['latitude', 'longitude']) reportForm.elements[name].onchange = () => {
  locationVersion++;
  error(reportForm);
  if(syncPin(true)) linkedAddress.point(reportForm.elements.latitude.value, reportForm.elements.longitude.value, true);
  else linkedAddress.clear(true);
};
$('#locate').onclick = () => {
  if (!navigator.geolocation) return error(reportForm, 'Este navegador não permite usar sua localização. Marque o local no mapa.');
  error(reportForm);
  const ownLocation = ++locationVersion;
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => { if(ownLocation===locationVersion && $('#create-dialog').open) setPoint(coords.latitude.toFixed(6),coords.longitude.toFixed(6),true); },
    () => { if(ownLocation===locationVersion && $('#create-dialog').open) error(reportForm, 'Não foi possível usar sua localização. Marque o local no mapa.'); },
    { timeout: 10000 }
  );
};
const photoField=reportForm.elements.foto;
let photoUrl;
function clearPhoto() {
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl=undefined;
  $('#photo-preview').hidden=true;
  $('#photo-preview img').removeAttribute('src');
  $('#photo-feedback').textContent='';
}
$('#create-dialog').addEventListener('close',()=>{ locationVersion++; updateSuggestions(false); clearPhoto(); linkedAddress.clear(); });
$('#remove-photo').onclick=()=>{
  photoField.value='';
  clearPhoto();
  photoField.focus();
};
photoField.onchange=()=>{
  clearPhoto();
  const file=photoField.files?.[0];
  if(!file) return;
  if (file.size>5*1024*1024 || (file.type&&!['image/jpeg','image/png','image/webp'].includes(file.type))) {
    photoField.value='';
    $('#photo-feedback').textContent='A foto precisa ser JPEG, PNG ou WebP e ter até 5 MB.';
    return;
  }
  photoUrl=URL.createObjectURL(file);
  $('#photo-preview img').src=photoUrl;
  $('#photo-preview').hidden=false;
};

reportForm.onsubmit = event => {
  event.preventDefault();
  if(linkedAddress.pending()) return error(reportForm,'Aguarde a consulta de endereço terminar antes de publicar.');
  if(!syncPin()) return error(reportForm,'Marque no mapa onde ocorreu o problema. O local precisa ficar na cidade de São Paulo.');
  submit(reportForm, async () => {
    const data = new FormData(reportForm);
    if (!data.get('foto')?.size) data.delete('foto');
    const result = await api('/ocorrencias', 'POST', data);
    $('#create-dialog').close();
    filters.reset();
    portal.syncFilters();
    await load();
    await portal.refresh();
    notice('Relato publicado. Protocolo '+protocol(result.id)+'.');
    await detail(result.id);
  });
};
function tags(report) {
  const node = element('div', null, 'tags');
  node.append(element('span', statuses[report.status], 'tag ' + report.status), element('span', report.categoria, 'tag'), element('span', 'Prioridade ' + report.prioridade, 'tag priority'));
  return node;
}
function photo(report, style) {
  const img = element('img', null, style);
  img.src = '/api/fotos/' + report.foto_id;
  img.alt = 'Foto da ocorrência: ' + report.titulo;
  img.loading = 'lazy';
  return img;
}
const locationText = report => report.endereco || (report.latitude != null ? report.latitude + ', ' + report.longitude : 'Sem localização');
const confirmationText = report => report.confirmacoes + (Number(report.confirmacoes) === 1 ? ' confirmação' : ' confirmações');
const commentText = count => count + (Number(count) === 1 ? ' comentário' : ' comentários');
function render() {
  $('#count').textContent = reports.length ? reports.length + (reports.length === 1 ? ' ocorrência exibida' : ' ocorrências exibidas') : '0 ocorrências';
  const cards = reports.map(report => {
    const card = element('article', null, 'card');
    if (report.foto_id) card.append(photo(report, 'card-photo'));
    card.append(element('small',protocol(report.id),'report-protocol'),tags(report), element('h3', report.titulo), element('p', locationText(report), 'muted'), element('small', confirmationText(report) + ' · ' + commentText(report.comentarios) + ' · ' + date(report.criado_em)), button('Ver ocorrência', () => detail(report.id)));
    return card;
  });
  const hasFilters = ['busca','categoria','status','periodo'].some(name => filters.elements[name].value);
  const emptyText = hasFilters ? 'Não há relatos com esses filtros. Limpe os filtros para ver mais.' : 'Ainda não há ocorrências nesta lista.';
  $('#cards').replaceChildren(...(cards.length ? cards : [element('div', emptyText, 'empty')]));
  if (!$('#map-panel').hidden) renderMap();
  portal.update(reports);
}
async function renderMap() {
  const container=$('#report-map');
  if(!reportMapPromise) {
    reportMapPromise=import('./city-map.js').then(module => module.createCityMap(container,detail,{flat:true,fitReports:true})).catch(async () => {
      container.replaceChildren();
      const { fallbackReports } = await import('./map-fallback.js');
      return fallbackReports(container,detail,{fitReports:true});
    }).catch(()=>null);
  }
  const reportMap=await reportMapPromise;
  if($('#map-panel').hidden) return;
  if(!reportMap) { $('#map-count').textContent='Não foi possível abrir o mapa. Use a lista para consultar os relatos.'; return; }
  reportMap.resize();
  const count=reportMap.update(reports);
  $('#map-count').textContent=count+(count===1?' ocorrência no mapa':' ocorrências no mapa');
}

function view(mode) {
  $('#cards').hidden = mode !== 'list';
  $('#map-panel').hidden = mode !== 'map';
  $('#board').hidden = mode !== 'board';
  for(const name of ['map','list','board']) $('#show-'+name).setAttribute('aria-pressed',String(name===mode));
  if (mode === 'map') renderMap();
}
$('#show-map').onclick = () => view('map');
$('#show-list').onclick = () => view('list');
$('#show-board').onclick = () => view('board');
async function load(append = false) {
  const generation = ++request;
  const next = append ? page + 1 : 1;
  const params = new URLSearchParams(new FormData(filters));
  params.set('pagina', next);
  if(portal.scope()) {
    if(!user) return;
    params.set('escopo',portal.scope());
  }
  $('#more').disabled = true;
  notice();
  try {
    const result = await api('/ocorrencias?' + params);
    if (generation !== request) return;
    reports = append ? [...reports, ...result.ocorrencias] : result.ocorrencias;
    page = next;
    $('#more').hidden = !result.mais;
    render();
  } catch (failure) { if (generation === request) notice(failure.message); }
  finally { if (generation === request) $('#more').disabled = false; }
}
filters.onsubmit = event => { event.preventDefault(); portal.syncFilters(); load(); };
for (const select of filters.querySelectorAll('select')) select.onchange = () => load();
$('#more').onclick = () => load(true);
function adminForm(report) {
  const form = element('form', null, 'detail-actions');
  const status = element('select');
  status.name = 'status';
  for (const [value, label] of Object.entries(statuses)) status.add(new Option(label, value, false, value === report.status));
  const label = element('label', 'Alterar status');
  label.append(status);
  const note = element('label', 'Observação (opcional)');
  const area = element('textarea');
  area.name = 'nota';
  area.rows = 2;
  area.maxLength = 500;
  note.append(area);
  const feedback = element('p', null, 'error');
  feedback.hidden = true;
  feedback.setAttribute('role', 'alert');
  form.append(label, note, feedback, element('button', 'Salvar status', 'action'));
  form.onsubmit = event => {
    event.preventDefault();
    submit(form, async () => {
      await api('/ocorrencias/' + report.id + '/status', 'PATCH', Object.fromEntries(new FormData(form)));
      await load();
      await portal.refresh();
      await detail(report.id);
    });
  };
  return form;
}
$('#detail').addEventListener('close', () => { if (!$('#detail').open) detailRequest++; });
async function detail(id) {
  const generation = ++detailRequest;
  const modal = $('#detail');
  const body = $('#detail-body');
  body.replaceChildren(element('p', 'Carregando…'));
  if (!modal.open) modal.showModal();
  try {
    const report = await api('/ocorrencias/' + id);
    if (generation !== detailRequest || !modal.open) return;
    const panel = element('article', null, 'details');
    panel.append(element('p', protocol(report.id), 'protocol-copy'), element('h2', report.titulo), tags(report));
    if (report.foto_id) panel.append(photo(report, 'detail-photo'));
    panel.append(element('p', report.descricao, 'detail-data'), element('p', locationText(report), 'muted'), element('p', confirmationText(report)));
    if (report.status !== 'resolvida' && user?.id !== report.autor_id && !report.confirmada) {
      const feedback = element('p', null, 'error');
      feedback.hidden = true;
      feedback.setAttribute('role', 'alert');
      const confirm = button('Também encontrei esse problema', async () => {
        if (!user) {
          modal.close();
          openAuth(() => detail(id));
          return;
        }
        confirm.disabled = true;
        feedback.hidden = true;
        try {
          await api('/ocorrencias/' + id + '/confirmacao', 'PUT');
          await load();
          if (modal.open && generation === detailRequest) await detail(id);
        } catch (failure) { feedback.textContent = failure.message; feedback.hidden = false; }
        finally { confirm.disabled = false; }
      }, 'action');
      panel.append(confirm, feedback);
    } else if (report.confirmada) panel.append(element('p', 'Você confirmou esta ocorrência.', 'muted'));
    panel.append(shareReport(report));
    if (user?.id === report.autor_id && report.status === 'aberta') panel.append(editReport(report));
    if (user?.papel === 'admin') panel.append(adminForm(report));
    panel.append(socialPanel(report));
    const history = element('ol', null, 'history');
    for (const entry of report.historico) {
      const event = element('li', null, 'history-event '+entry.status);
      const time = element('time', date(entry.criado_em));
      time.dateTime = new Date(entry.criado_em).toISOString();
      event.append(element('strong',statuses[entry.status]), time);
      if (entry.nota) event.append(element('p',entry.nota));
      history.append(event);
    }
    panel.append(element('h3', 'Histórico'), history);
    body.replaceChildren(panel);
  } catch (failure) {
    if (generation === detailRequest) body.replaceChildren(element('p', failure.message, 'error'));
  }
}
function shareReport(report) {
  const row = element('div',null,'details');
  const feedback = element('div',null,'muted share-feedback');
  feedback.setAttribute('role','status');
  const link = new URL(location.href);
  link.hash = 'ocorrencia/' + report.id;
  row.append(button('Copiar link da ocorrência',async () => {
    try {
      await navigator.clipboard.writeText(link.href);
      feedback.textContent = 'Link copiado.';
    } catch {
      const field = element('input');
      field.value = link.href;
      field.readOnly = true;
      field.setAttribute('aria-label','Link para compartilhar');
      feedback.replaceChildren(element('p','Copie o link abaixo para compartilhar.'),field);
      field.focus();
      field.select();
    }
  }),feedback);
  return row;
}

function editReport(report) {
  const section = element('details',null,'detail-actions');
  section.append(element('summary','Editar meu relato'));
  const form = element('form');
  function field(labelText, name, control) {
    const label = element('label',labelText);
    control.name = name;
    control.required = true;
    label.append(control);
    form.append(label);
  }
  const title = element('input');
  title.value = report.titulo;
  title.minLength = 5;
  title.maxLength = 100;
  field('Título','titulo',title);
  const category = element('select');
  for (const option of categoryOptions) category.add(new Option(option.nome,option.id,false,option.id===report.categoria_id));
  field('Categoria','categoria_id',category);
  const description = element('textarea');
  description.value = report.descricao;
  description.minLength = 10;
  description.maxLength = 2000;
  description.rows = 4;
  field('Descrição','descricao',description);
  const feedback = element('p',null,'error');
  feedback.hidden = true;
  feedback.setAttribute('role','alert');
  form.append(feedback,element('button','Salvar alterações','action'));
  form.onsubmit = event => {
    event.preventDefault();
    submit(form,async () => {
      await api('/ocorrencias/'+report.id+'/relato','PATCH',Object.fromEntries(new FormData(form)));
      await load();
      await portal.refresh();
      if ($('#detail').open) await detail(report.id);
    });
  };
  section.append(form);
  return section;
}

function socialPanel(report) {
  const section=element('section',null,'details');
  const actions=element('div',null,'row');
  const requireAccount=()=>{ $('#detail').close(); openAuth(()=>detail(report.id)); };
  const follow=button(report.acompanhando?'Deixar de acompanhar':'Acompanhar ocorrência',async()=>{
    if(!user) return requireAccount();
    follow.disabled=true;
    try {
      await api('/ocorrencias/'+report.id+'/acompanhamento','PUT',{ativo:!report.acompanhando});
      await load();
      if($('#detail').open) await detail(report.id);
    } catch(failure) { notice(failure.message); }
    finally { follow.disabled=false; }
  });
  actions.append(follow);
  section.append(actions,element('h3','Comentários · '+report.comentarios));
  const list=element('div',null,'comment-list');
  const path='/ocorrencias/'+report.id+'/comentarios';
  const more=button('Ver comentários anteriores',()=>comments(true));
  more.hidden=true;
  let before;
  async function comments(append=false) {
    more.disabled=true;
    try {
      const entries=await api(path+(append?'?antes='+before:''));
      const nodes=entries.map(entry=>{
        const item=element('article',null,'comment');
        item.append(element('strong',entry.nome),element('small',' · '+date(entry.criado_em)),element('p',entry.texto));
        if(user?.id===entry.usuario_id||user?.papel==='admin') {
          const remove=button('Excluir comentário',async()=>{
            if(!confirm('Excluir este comentário?')) return;
            remove.disabled=true;
            try{await api(path+'/'+entry.id,'DELETE');await load();if($('#detail').open)await detail(report.id);}
            catch(failure){notice(failure.message);remove.disabled=false;}
          });
          item.append(remove);
        }
        return item;
      });
      if(append) list.append(...nodes);
      else list.replaceChildren(...(nodes.length?nodes:[element('p','Nenhum comentário ainda.','muted')]));
      before=entries.at(-1)?.id;
      more.hidden=entries.length<30;
    } catch(failure) { notice(failure.message); }
    finally { more.disabled=false; }
  }
  section.append(list,more);
  if(!user) section.append(button('Entrar para comentar',requireAccount));
  else {
    const form=element('form',null,'detail-actions');
    const label=element('label','Seu comentário');
    const input=element('textarea');
    input.name='texto';input.required=true;input.minLength=3;input.maxLength=1000;input.rows=3;
    label.append(input);
    const feedback=element('p',null,'error');
    feedback.hidden=true;
    feedback.setAttribute('role','alert');
    form.append(label,feedback,element('button','Publicar comentário','action'));
    form.onsubmit=event=>{
      event.preventDefault();
      submit(form,async()=>{
        await api(path,'POST',{texto:input.value});
        await load();
        if($('#detail').open)await detail(report.id);
      });
    };
    section.append(form);
  }
  comments();
  return section;
}

portal = connectPortal({
  $, api, element, button, submit, notice, date, statuses, detail, load, view, filters,
  setUser, getUser:()=>user, openAuth,
});

try {
  const [session, categories, boundary] = await Promise.all([api('/sessao'), api('/categorias'), fetch('/data/sao-paulo.geojson').then(r=>r.json())]);
  territory=boundary;
  categoryOptions=categories;
  setUser(session.usuario);
  for (const category of categories) {
    filters.elements.categoria.add(new Option(category.nome, category.id));
    reportForm.elements.categoria_id.add(new Option(category.nome, category.id));
    $('#arrival-filters').elements.categoria.add(new Option(category.nome,category.id));
  }
  await portal.navigate();
} catch (failure) {
  $('#count').textContent = 'Não foi possível carregar as ocorrências';
  notice(failure.message);
}
