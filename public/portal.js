import { connectNearby } from './nearby.js';
import { connectTracking } from './tracking.js';
import { connectScrollVideo } from './scroll-video.js';
import { connectParticipationRide } from './participation-ride.js';
export function connectPortal(ui) {
  const { $, api, element, button, submit, notice, date, statuses, detail, load, view, filters, setUser, getUser, openAuth } = ui;
  const titles = {
    explorar:['Ocorrências em São Paulo','Veja os relatos em lista ou no mapa. Use os filtros para encontrar um problema específico.'],
    minhas:['Meus relatos','Veja o que você registrou e edite os relatos que ainda estão abertos.'],
    acompanhando:['Acompanhando','Veja as ocorrências que você escolheu acompanhar.'],
    gestao:['Gestão de ocorrências','Abra uma ocorrência no quadro ou na lista para atualizar o status e deixar uma observação.'],
  };
  const breadcrumb = {perto:'Ocorrências por perto',inicio:'Início',indicadores:'Indicadores',como:'Como participar',central:'Acompanhar ocorrências',...Object.fromEntries(Object.entries(titles).map(([key,value])=>[key,value[0]]))};
  let current = 'inicio';
  let explorerSearch = '';
  let cityMap, activeMapRequest = 0, latestSummary;
  let mapPromise;
  const arrival = $('#arrival-filters');
  const mainMap = $('#overview-map');
  const journey = $('#journey');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const portal = {
    syncFilters,
    scope:()=>['minhas','acompanhando'].includes(current)?current:'',
    onUser,
    update,
    refresh,
  };
  document.body.classList.add('cinematic');
  const header=$('#site-header');
  const ride=$('#participate-ride');
  const refreshNearby=connectNearby(ui);
  const tracking=connectTracking({ $, api, element, date, statuses, detail });
  const accountMenu=$('#account-menu');
  const accountSummary=accountMenu.querySelector('summary');
  const routeLinks=document.querySelectorAll('.site-nav [data-page]');

  function updateHeaderBackdrop() {
    const rideBounds=ride.getBoundingClientRect();
    const onRide=ride.classList.contains('is-animated') && !ride.classList.contains('video-unavailable') && rideBounds.top<=0 && rideBounds.bottom>header.offsetHeight;
    const onOpening=!journey.hidden && journey.getBoundingClientRect().bottom>header.offsetHeight;
    header.classList.toggle('over-video',onOpening||onRide);
  }
  addEventListener('scroll',updateHeaderBackdrop,{passive:true});
  function measureHeader() {
    document.documentElement.style.setProperty('--site-header-height', header.offsetHeight+'px');
    syncJourney();
    updateHeaderBackdrop();
  }
  function closeAccount(restoreFocus=false) {
    if(!accountMenu.open) return;
    accountMenu.open=false;
    if(restoreFocus) accountSummary.focus({preventScroll:true});
  }

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
  function updateComparison() {
    if (!latestSummary?.periodos) return;
    const days = Number($('#period-window').value);
    const counts = latestSummary.periodos;
    const total = Number(counts['d'+days]);
    $('#period-current').textContent = total;
    $('#period-previous').textContent = Number(counts['d'+(days*2)]) - total;
    $('#period-current-label').textContent = 'Últimos '+days+' dias';
    $('#period-previous-label').textContent = days+' dias anteriores';
    $('#period-link').href = '#explorar?periodo='+days;
  }
  $('#period-window').onchange = updateComparison;
  async function refresh() {
    if(current==='perto') return refreshNearby();
    if(current==='central') return tracking.refresh();
    if (!['inicio','indicadores'].includes(current)) return;
    try {
      const data=await api('/painel');
      latestSummary=data;
      updateComparison();
      const total=data.totais;
      const metrics=[['Ocorrências',total.total],['Abertas',total.abertas],['Em andamento',total.andamento],['Resolvidas',total.resolvidas],['Confirmações',total.confirmacoes]];
      for (const target of ['#stats','#analytics-stats']) $(target).replaceChildren(...metrics.map(([label,value])=>figure(label,value)));
      const entries=data.categorias.map(c=>[c.categoria,c.total]);
      if (!entries.length) $('#category-bars').replaceChildren(element('p','Ainda não há ocorrências para mostrar por categoria.','muted'));
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
      $('#recent-reports').replaceChildren(...(ocorrencias.length?ocorrencias.slice(0,5).map(reportRow):[element('p','Ainda não há relatos para mostrar.','muted')]));
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
        const { fallbackReports }=await import('./map-fallback.js');
        if (!window.L) return;
        cityMap=fallbackReports(mainMap,detail);
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
  connectParticipationRide(ride);
  measureHeader();
  new ResizeObserver(measureHeader).observe(header);
  accountMenu.addEventListener('keydown',event=>{
    if(event.key==='Escape' && accountMenu.open) { event.preventDefault(); closeAccount(true); }
  });
  accountMenu.addEventListener('click',event=>{
    if(event.target.closest('.account-links a, .account-links button')) closeAccount(true);
  },true);
  document.addEventListener('pointerdown',event=>{
    if(!accountMenu.contains(event.target)) closeAccount();
  });
  document.querySelector('.skip-link').addEventListener('click',event=>{
    event.preventDefault();
    $('#content').focus({preventScroll:true});
    $('#content').scrollIntoView({block:'start'});
  });
  $('#hero-create').onclick=()=>$('#create').click();
  document.querySelectorAll('.create-shortcut').forEach(node=>node.onclick=()=>$('#create').click());
  function syncFilters() {
    if(current!=='explorar') return;
    const params=new URLSearchParams(new FormData(filters));
    for(const [name,value] of [...params]) {
      if(!value || (name==='ordem' && value==='prioridade')) params.delete(name);
    }
    explorerSearch=params.toString();
    history.replaceState(null,'','#explorar'+(explorerSearch?'?'+explorerSearch:''));
  }
  $('#share-search').onclick=async ()=>{
    syncFilters();
    load();
    try {
      await navigator.clipboard.writeText(location.href);
      notice('Link da busca copiado.');
    } catch { notice('A busca está na barra de endereço. Copie o link por lá.'); }
  };
  $('#reset-filters').onclick=()=>{
    filters.reset();
    if(current==='explorar' && explorerSearch) { explorerSearch=''; history.replaceState(null,'','#explorar'); }
    load();
  };

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

  async function navigate({focus=false}={}) {
    const hash=location.hash.slice(1);
    const [path, search=''] = hash.split('?');
    const reportLink = /^ocorrencia\/(\d{1,10})$/.exec(path);
    const route=reportLink?'central':path==='content'?current:(path==='mapa'||path==='participate-ride')?'inicio':Object.hasOwn(breadcrumb,path)?path:'inicio';
    const previous=current;
    current=route;
    const home=route==='inicio';
    document.body.classList.toggle('cinematic',home);
    journey.hidden=!home;
    updateHeaderBackdrop();
    syncJourney();
    $('#page-inicio').hidden=!home;
    for(const name of ['indicadores','como','central','perto']) $('#page-'+name).hidden=route!==name;
    $('#page-explorar').hidden=!titles[route];
    const destination=hash==='mapa'?'mapa':route;
    closeAccount();
    for(const link of routeLinks) {
      if(link.dataset.page===destination) link.setAttribute('aria-current',destination==='mapa'?'location':'page');
      else link.removeAttribute('aria-current');
    }
    if(destination==='mapa'){
      $('#mapa').scrollIntoView({behavior:'instant',block:'start'});
      if(focus) $('#mapa').focus({preventScroll:true});
      prepareMap().then(()=>cityMap?.resize());
    } else if(path==='participate-ride') {
      ride.scrollIntoView({behavior:'instant',block:'start'});
      if(focus) ride.focus({preventScroll:true});
    } else if(hash!=='content') {
      scrollTo(0,0);
      if(focus) $('#content').focus({preventScroll:true});
    }
    if(reportLink) {
      const reportId=Number(reportLink[1]);
      tracking.setProtocol(reportId);
      detail(reportId);
    }
    $('#share-search').hidden=route!=='explorar';
    if(titles[route]) {
      $('#explorer-title').textContent=titles[route][0];
      $('#explorer-description').textContent=titles[route][1];
      if(previous!==route || (route==='explorar' && explorerSearch!==search)) filters.reset();
      if(route==='explorar') {
        explorerSearch=search;
        const params=new URLSearchParams(search);
        filters.elements.busca.value=(params.get('busca')||'').slice(0,100);
        for(const name of ['categoria','ordem']) {
          const field=filters.elements[name];
          if([...field.options].some(option=>option.value===params.get(name))) field.value=params.get(name);
        }
        const period=params.get('periodo');
        if(['7','30','90'].includes(period)) filters.elements.periodo.value=period;
        const status=params.get('status');
        if(Object.hasOwn(statuses,status)) filters.elements.status.value=status;
      }
      $('#show-board').hidden=route!=='gestao';
      if(route==='gestao' && getUser()?.papel!=='admin') { location.hash='explorar'; return; }
      if(portal.scope()&&!getUser()) {
        $('#cards').replaceChildren(element('div','Entre na sua conta para acessar esta área.','empty'));
        $('#count').textContent='Faça login para continuar.';
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
  addEventListener('hashchange',()=>navigate({focus:true}));
  document.querySelectorAll('a[href^="#"]:not(.skip-link)').forEach(link=>link.addEventListener('click',event=>{
    if(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if(link.hash===location.hash) {
      event.preventDefault();
      navigate({focus:true});
    }
  }));

  function onUser(user) {
    $('#admin-nav').hidden=user?.papel!=='admin';
    $('#profile').hidden=!user;
    $('#notifications').hidden=!user;
    $('#account').hidden=!user;
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
    $('#notification-list').replaceChildren(...(nodes.length?nodes:[element('p','Você ainda não tem notificações.','muted')]));
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
    if(!latestSummary) return notice('Aguarde os indicadores carregarem para baixar o CSV.');
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

