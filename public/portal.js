import { connectScrollVideo } from './scroll-video.js';
export function connectPortal(ui) {
  const { $, api, element, button, submit, notice, date, statuses, detail, load, view, filters, setUser, getUser, openAuth } = ui;
  const titles = {
    explorar:['Explorar ocorrências','Encontre relatos no mapa ou na lista e filtre por tipo e situação.'],
    minhas:['Meus relatos','Confira a situação das ocorrências que você registrou.'],
    acompanhando:['Acompanhando','Consulte os relatos que você salvou para receber atualizações.'],
    gestao:['Gestão de ocorrências','Organize os relatos por status e abra cada ficha para registrar uma atualização.'],
  };
  const breadcrumb = {inicio:'Visão geral',indicadores:'Indicadores',como:'Como participar',...Object.fromEntries(Object.entries(titles).map(([key,value])=>[key,value[0]]))};
  let current = 'inicio';
  let cityMap, activeMapRequest = 0, latestSummary;
  let mapPromise;
  const arrival = $('#arrival-filters');
  const mainMap = $('#overview-map');
  const journey = $('#journey');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const portal = {
    scope:()=>['minhas','acompanhando'].includes(current)?current:'',
    onUser,
    update,
    refresh,
  };
  document.body.classList.add('cinematic');

  function figure(label,value) {
    const card=element('article',null,'stat');
    card.append(element('strong',value),element('span',label));
    return card;
  }
  function bars(target,entries,max) {
    target.replaceChildren();
    for (const [label,value] of entries) {
      const row=element('div',null,'chart-row');
      const track=element('span',null,'chart-track');
      const fill=element('i');
      fill.style.width=Number(value)*100/Math.max(max,1)+'%';
      track.append(fill);
      row.append(element('span',label),track,element('strong',value));
      target.append(row);
    }
  }
  async function refresh() {
    if (!['inicio','indicadores'].includes(current)) return;
    try {
      const data=await api('/painel');
      latestSummary=data;
      const total=data.totais;
      const metrics=[['Ocorrências',total.total],['Abertas',total.abertas],['Em andamento',total.andamento],['Resolvidas',total.resolvidas],['Confirmações',total.confirmacoes]];
      for (const target of ['#stats','#analytics-stats']) $(target).replaceChildren(...metrics.map(([label,value])=>figure(label,value)));
      const entries=data.categorias.map(c=>[c.categoria,c.total]);
      if (!entries.length) $('#category-bars').replaceChildren(element('p','As categorias ganham dados quando o primeiro relato for publicado.','muted'));
      else bars($('#category-bars'),entries,Math.max(...entries.map(entry=>entry[1])));
      bars($('#status-chart'),metrics.slice(1,4),Number(total.total));
      const series=new Map(data.dias.map(d=>[d.dia,Number(d.total)]));
      const max=Math.max(1,...series.values());
      const days=[];
      const now=new Date();
      for(let offset=13;offset>=0;offset--){
        const day=new Date(now);
        day.setUTCDate(day.getUTCDate()-offset);
        const key=day.toISOString().slice(0,10);
        const value=series.get(key)||0;
        const column=element('div',null,'day');
        const line=element('i');
        line.style.height=Math.max(2,value*105/max)+'px';
        column.append(element('strong',value),line,element('span',key.slice(-2)));
        column.title=key+' · '+value;
        days.push(column);
      }
      $('#daily-chart').replaceChildren(...days);
    } catch (error) { notice(error.message); }
    if(current==='inicio') refreshArrival();
  }
  function reportRow(report) {
    const item=button('',()=>detail(report.id),'recent-row');
    item.append(element('strong',report.titulo),element('small',statuses[report.status]));
    return item;
  }
  async function refreshArrival() {
    const request=++activeMapRequest;
    try {
      const params=new URLSearchParams(new FormData(arrival));
      params.set('ordem','recente');
      const { ocorrencias, mais }=await api('/ocorrencias?'+params);
      if(request!==activeMapRequest) return;
      const total=cityMap?.update(ocorrencias)??ocorrencias.length;
      const wording=total===1?'1 ocorrência no mapa':total+' ocorrências no mapa';
      $('#overview-map-count').textContent=mais ? wording+' · veja mais na lista' : wording;
      $('#recent-reports').replaceChildren(...(ocorrencias.length?ocorrencias.slice(0,5).map(reportRow):[element('p','Os primeiros relatos da comunidade aparecerão aqui.','muted')]));
    } catch(error) { $('#overview-map-count').textContent=error.message; }
  }
  async function prepareMap() {
    if(mapPromise) return mapPromise;
    mapPromise=(async()=>{
      try {
        const { createCityMap }=await import('/city-map.js');
        cityMap=createCityMap('overview-map',detail);
      } catch {
        mainMap.replaceChildren();
        if (!window.L) return;
        const map=L.map(mainMap,{scrollWheelZoom:false}).setView([-23.6127,-46.6991],13);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
        fetch('/data/sao-paulo.geojson').then(r=>r.json()).then(geo=>L.geoJSON(geo,{color:'#659629',fillOpacity:.03}).addTo(map)).catch(()=>{});
        const markers=L.layerGroup().addTo(map);
        cityMap={
          resize:()=>map.invalidateSize(),
          bridge:()=>map.setView([-23.6127,-46.6991],14),
          city:()=>map.setView([-23.70,-46.63],10),
          update(reports){
            markers.clearLayers();
            for(const report of reports) L.marker([report.latitude,report.longitude]).addTo(markers).on('click',()=>detail(report.id));
            return reports.length;
          },
        };
        $('#map-mode').hidden=true;
      }
      await refreshArrival();
    })();
    return mapPromise;
  }
  const observer=new IntersectionObserver(entries=>{
    if(entries.some(e=>e.isIntersecting)) { prepareMap(); observer.disconnect(); }
  },{rootMargin:'280px'});
  observer.observe(mainMap);
  arrival.onchange=refreshArrival;
  $('#map-city').onclick=()=>cityMap?.city();
  $('#map-bridge').onclick=()=>cityMap?.bridge();
  $('#map-mode').onclick=event=>{
    const flat=event.currentTarget.getAttribute('aria-pressed')!=='true';
    event.currentTarget.setAttribute('aria-pressed',String(flat));
    event.currentTarget.textContent=flat?'Visão 3D':'Visão 2D';
    cityMap?.setPlanar?.(flat);
  };
  const syncJourney = connectScrollVideo(journey, $('#journey-video'), $('#scroll-hint'), reduceMotion);
  $('#journey-notifications').onclick=()=>$('#notifications').click();
  $('#journey-auth').onclick=()=>$('#auth').click();
  $('#hero-create').onclick=()=>$('#create').click();
  document.querySelectorAll('.create-shortcut').forEach(node=>node.onclick=()=>$('#create').click());
  $('#reset-filters').onclick=()=>{filters.reset();load();};

  function renderBoard(reports) {
    $('#board').replaceChildren(...Object.entries(statuses).map(([status,label])=>{
      const column=element('section');
      const items=reports.filter(report=>report.status===status);
      column.append(element('h3',label+' · '+items.length));
      column.append(...(items.length?items.map(reportRow):[element('p','Nenhuma ocorrência','muted')]));
      return column;
    }));
  }
  function update(reports) { if(current==='gestao') renderBoard(reports); }

  async function navigate() {
    const hash=location.hash.slice(1);
    const route=hash==='mapa'?'inicio':Object.hasOwn(breadcrumb,hash)?hash:'inicio';
    const previous=current;
    current=route;
    const home=route==='inicio';
    document.body.classList.toggle('cinematic',home);
    journey.hidden=!home;
    syncJourney();
    $('#page-inicio').hidden=!home;
    for(const name of ['indicadores','como']) $('#page-'+name).hidden=route!==name;
    $('#page-explorar').hidden=!titles[route];
    $('#breadcrumb').textContent=breadcrumb[route];
    document.querySelectorAll('.side-nav [data-page]').forEach(link=>{
      if(link.dataset.page===route) link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    });
    if(hash==='mapa'){
      $('#mapa').scrollIntoView({behavior:'instant',block:'start'});
      prepareMap().then(()=>cityMap?.resize());
    } else if(hash!=='content') scrollTo(0,0);
    if(titles[route]) {
      $('#explorer-title').textContent=titles[route][0];
      $('#explorer-description').textContent=titles[route][1];
      if(previous!==route) filters.reset();
      $('#show-board').hidden=route!=='gestao';
      if(route==='gestao' && getUser()?.papel!=='admin') { location.hash='explorar'; return; }
      if(portal.scope()&&!getUser()) {
        $('#cards').replaceChildren(element('div','Entre na sua conta para acessar esta área.','empty'));
        $('#count').textContent='Área da sua conta';
        $('#more').hidden=true;
        view('list');
        openAuth(()=>load());
        return;
      }
      view(route==='gestao'?'board':'list');
      await load();
    } else await refresh();
  }
  portal.navigate=navigate;
  addEventListener('hashchange',navigate);
  document.querySelectorAll('a[href="#mapa"]').forEach(link=>link.addEventListener('click',event=>{
    event.preventDefault();
    if(location.hash==='#mapa') navigate();
    else location.hash='mapa';
  }));

  function onUser(user) {
    $('#admin-nav').hidden=user?.papel!=='admin';
    $('#profile').hidden=!user;
    $('#journey-auth').textContent=user?'Sair':'Entrar';
    $('#journey-notifications').hidden=!user;
    if(user) updateUnread();
    else $('#unread').hidden=true;
  }
  async function updateUnread() {
    try {
      const messages=await api('/notificacoes');
      if(!getUser()) return [];
      const unread=messages.filter(entry=>!entry.lida).length;
      $('#unread').hidden=!unread;
      $('#unread').textContent=unread;
      return messages;
    } catch { return []; }
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&getUser())updateUnread();});
  setInterval(()=>{if(!document.hidden&&getUser())updateUnread();},45000);
  $('#notifications').onclick=async()=>{
    if(!getUser()) return openAuth(()=>$('#notifications').click());
    const dialog=$('#notifications-dialog');
    dialog.showModal();
    const messages=await updateUnread();
    const nodes=messages.map(message=>{
      const item=element('article',null,'notification-item'+(message.lida?'':' unread'));
      item.append(element('p',message.mensagem),element('small',date(message.criado_em)),element('br'),button('Abrir ocorrência',()=>{dialog.close();detail(message.ocorrencia_id);}));
      return item;
    });
    $('#notification-list').replaceChildren(...(nodes.length?nodes:[element('p','Você ainda não recebeu atualizações.','muted')]));
    $('#mark-read').hidden=!messages.some(message=>!message.lida);
  };
  $('#mark-read').onclick=async()=>{
    try{await api('/notificacoes/lidas','PUT');$('#notifications-dialog').close();await updateUnread();}
    catch(error){notice(error.message);}
  };
  $('#profile').onclick=()=>{
    const user=getUser();
    $('#profile-email').textContent=user.email;
    $('#profile-form').elements.nome.value=user.nome;
    $('#password-form').reset();
    $('#profile-dialog').showModal();
  };
  $('#profile-form').onsubmit=event=>{
    event.preventDefault();
    const form=event.currentTarget;
    submit(form,async()=>{
      setUser(await api('/perfil','PATCH',Object.fromEntries(new FormData(form))));
      $('#profile-dialog').close();
      notice('Nome atualizado.');
    });
  };
  $('#password-form').onsubmit=event=>{
    event.preventDefault();
    const form=event.currentTarget;
    submit(form,async()=>{
      await api('/senha','PUT',Object.fromEntries(new FormData(form)));
      form.reset();
      setUser(null);
      $('#profile-dialog').close();
      location.hash='explorar';
      openAuth();
      notice('Senha alterada. Entre com sua nova senha.');
    });
  };
  const csv=values=>values.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(';');
  $('#export').onclick=()=>{
    if(!latestSummary) return notice('Os indicadores ainda estão carregando.');
    const data=latestSummary;
    const records=[csv(['Indicador','Chave','Total']),
      ...Object.entries(data.totais).map(([label,value])=>csv(['Resumo',label,value])),
      ...data.categorias.map(c=>csv(['Categoria',c.categoria,c.total])),
      ...Array.from(document.querySelectorAll('#daily-chart .day')).map(day=>{ const [date,value]=day.title.split(' · '); return csv(['Dia',date,value]); })];
    const url=URL.createObjectURL(new Blob(['\ufeff'+records.join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const link=element('a');
    link.href=url;link.download='cidade-viva-indicadores-sp.csv';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return portal;
}

