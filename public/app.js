import { containsPoint } from './territory.js';
import { connectPortal } from './portal.js';
const $ = selector => document.querySelector(selector);
const statuses = { aberta: 'Aberta', andamento: 'Em andamento', resolvida: 'Resolvida' };
const center = [-23.60, -46.65];
let territory;
let portal;
const reportForm = $('#report-form');
const filters = $('#filters');
const authForm = $('#auth-form');
let user, signup = false, afterAuth, reportMap, markers, pickMap, pin;
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
  const response = await fetch('/api' + path, options);
  if (response.status === 204) return;
  const data = await response.json();
  if (!response.ok) throw new Error(data.erro || 'Falha de comunicação com o servidor.');
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
  const submitButton = form.querySelector('button:not([type]),button[type=submit]');
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
  $('#auth-submit').textContent = signup ? 'Criar minha conta' : 'Entrar';
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
    notice('Você saiu da sua conta.');
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
function mapOn(target) {
  if (!window.L) return null;
  const map = L.map(target).setView(center, 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  if(territory) L.geoJSON(territory,{color:'#a0bd45',fillOpacity:.045,interactive:false}).addTo(map);
  return map;
}
function syncPin() {
  if (!pickMap) return;
  if (pin) { pin.remove(); pin = null; }
  const { latitude, longitude } = reportForm.elements;
  if (latitude.value && longitude.value && latitude.validity.valid && longitude.validity.valid) {
    const point = [Number(latitude.value), Number(longitude.value)];
    pin = L.marker(point).addTo(pickMap);
    pickMap.panTo(point);
  }
}
function setPoint(lat, lng) {
  if (lat != null && lng != null && territory && !containsPoint(territory,Number(lat),Number(lng))) {
    error(reportForm,'Escolha um ponto dentro do município de São Paulo.');
    return;
  }
  error(reportForm);
  reportForm.elements.latitude.value = lat ?? '';
  reportForm.elements.longitude.value = lng ?? '';
  syncPin();
}
function createReport() {
  if (!user) return openAuth(createReport);
  reportForm.reset();
  error(reportForm);
  $('#create-dialog').showModal();
  if (!pickMap) {
    pickMap = mapOn('pick-map');
    pickMap?.on('click', ({ latlng }) => setPoint(latlng.lat.toFixed(6), latlng.lng.toFixed(6)));
  }
  pickMap?.invalidateSize();
  syncPin();
}
$('#create').onclick = createReport;
$('#clear-location').onclick = () => setPoint(null, null);
for (const name of ['latitude', 'longitude']) reportForm.elements[name].onchange = syncPin;
$('#locate').onclick = () => {
  if (!navigator.geolocation) return error(reportForm, 'Localização indisponível neste navegador.');
  error(reportForm);
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => setPoint(coords.latitude.toFixed(6), coords.longitude.toFixed(6)),
    () => error(reportForm, 'Não foi possível obter sua localização. Marque um ponto no mapa.'),
    { timeout: 10000 }
  );
};
reportForm.onsubmit = event => {
  event.preventDefault();
  submit(reportForm, async () => {
    const data = new FormData(reportForm);
    if (!data.get('foto')?.size) data.delete('foto');
    const result = await api('/ocorrencias', 'POST', data);
    $('#create-dialog').close();
    filters.reset();
    await load();
    await portal.refresh();
    notice('Ocorrência publicada.');
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
const locationText = report => report.endereco || (report.latitude != null ? report.latitude + ', ' + report.longitude : 'Local não informado');
const confirmationText = report => report.confirmacoes + (Number(report.confirmacoes) === 1 ? ' confirmação' : ' confirmações');
function render() {
  $('#count').textContent = reports.length ? reports.length + (reports.length === 1 ? ' ocorrência exibida' : ' ocorrências exibidas') : 'Nenhuma ocorrência nos filtros atuais';
  const cards = reports.map(report => {
    const card = element('article', null, 'card');
    if (report.foto_id) card.append(photo(report, 'card-photo'));
    card.append(tags(report), element('h3', report.titulo), element('p', locationText(report), 'muted'), element('small', confirmationText(report) + ' · ' + report.comentarios + ' comentário(s) · ' + date(report.criado_em)), button('Ver ocorrência', () => detail(report.id)));
    return card;
  });
  $('#cards').replaceChildren(...(cards.length ? cards : [element('div', 'Nenhuma ocorrência encontrada. Ajuste os filtros ou registre um problema no seu bairro.', 'empty')]));
  if (!$('#map-panel').hidden) renderMap();
  portal.update(reports);
}
function renderMap() {
  reportMap ||= mapOn('report-map');
  if (!reportMap) { $('#map-count').textContent = 'O mapa está indisponível.'; return; }
  reportMap.invalidateSize();
  markers?.remove();
  markers = L.featureGroup().addTo(reportMap);
  let count = 0;
  for (const report of reports) {
    if (report.latitude == null) continue;
    const popup = element('div');
    popup.append(element('p', report.titulo), button('Ver ocorrência', () => detail(report.id)));
    L.marker([report.latitude, report.longitude]).bindPopup(popup).addTo(markers);
    count++;
  }
  $('#map-count').textContent = count + (count === 1 ? ' ocorrência no mapa' : ' ocorrências no mapa');
  if (count) reportMap.fitBounds(markers.getBounds(), { padding: [25, 25], maxZoom: 16 });
  else reportMap.setView(center, 12);
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
filters.onsubmit = event => { event.preventDefault(); load(); };
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
    panel.append(element('h2', report.titulo), tags(report));
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
    if (user?.papel === 'admin') panel.append(adminForm(report));
    panel.append(socialPanel(report));
    const history = element('ol', null, 'history');
    for (const entry of report.historico) history.append(element('li', statuses[entry.status] + ' · ' + date(entry.criado_em) + (entry.nota ? ' · ' + entry.nota : '')));
    panel.append(element('h3', 'Histórico'), history);
    body.replaceChildren(panel);
  } catch (failure) {
    if (generation === detailRequest) body.replaceChildren(element('p', failure.message, 'error'));
  }
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
  setUser(session.usuario);
  for (const category of categories) {
    filters.elements.categoria.add(new Option(category.nome, category.id));
    reportForm.elements.categoria_id.add(new Option(category.nome, category.id));
    $('#arrival-filters').elements.categoria.add(new Option(category.nome,category.id));
  }
  await portal.navigate();
} catch (failure) {
  $('#count').textContent = 'Painel indisponível';
  notice(failure.message);
}
