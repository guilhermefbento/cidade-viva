export const protocol = id => 'CV-' + String(id).padStart(6, '0');

export function connectTracking({ $, api, element, date, statuses, detail }) {
  const form = $('#protocol-form');
  const filter = $('#activity-filters');
  const list = $('#activity-list');
  const feedback = $('#activity-feedback');
  const more = $('#activity-more');
  let nextCursor = null;
  let request = 0;

  function showReport(id) {
    const hash = '#ocorrencia/' + id;
    if(location.hash === hash) detail(id);
    else location.hash = hash;
  }

  form.onsubmit = event => {
    event.preventDefault();
    const value = form.elements.protocolo.value.trim();
    const match = /^(?:CV[ -]?)?#?(\d{1,10})$/i.exec(value);
    const id = Number(match?.[1]);
    const error = $('#protocol-error');
    if (!Number.isInteger(id) || id < 1 || id > 2147483647) {
      error.textContent = 'Digite o código do relato, como CV-000123. Você também pode usar só os números.';
      error.hidden = false;
      form.elements.protocolo.focus();
      return;
    }
    error.hidden = true;
    form.elements.protocolo.value = protocol(id);
    showReport(id);
  };
  form.elements.protocolo.oninput = () => { $('#protocol-error').hidden = true; };

  function activityRow(event) {
    const item = element('li',null,'activity-item');
    const text = element('div');
    const link = element('a',event.titulo);
    link.href = '#ocorrencia/' + event.ocorrencia_id;
    link.onclick = click => {
      if(click.ctrlKey || click.metaKey || click.shiftKey || click.altKey) return;
      click.preventDefault();
      showReport(event.ocorrencia_id);
    };
    text.append(link,element('small',protocol(event.ocorrencia_id)+' · '+event.categoria+' · '+date(event.criado_em)));
    item.append(text,element('span',statuses[event.status],'tag '+event.status));
    return item;
  }

  async function loadActivity(append = false) {
    const ticket = ++request;
    if (!append) {
      list.replaceChildren();
      nextCursor = null;
      more.hidden = true;
    }
    more.disabled = true;
    feedback.textContent = 'Carregando atualizações…';
    const params = new URLSearchParams(new FormData(filter));
    if (append && nextCursor) params.set('antes',nextCursor);
    try {
      const data = await api('/atividade?' + params);
      if(ticket !== request) return;
      list.append(...data.eventos.map(activityRow));
      nextCursor = data.proximo;
      more.hidden = !nextCursor;
      feedback.textContent = list.children.length ? '' : 'Não há atualizações com esses filtros.';
    } catch(error) {
      if(ticket === request) feedback.textContent = error.message;
    } finally {
      if(ticket === request) more.disabled = false;
    }
  }
  filter.onchange = () => loadActivity();
  more.onclick = () => loadActivity(true);
  return {
    setProtocol(id) { form.elements.protocolo.value = protocol(id); $('#protocol-error').hidden = true; },
    async refresh() {
      const summaryError = $('#central-summary-error');
      summaryError.hidden = true;
      await Promise.all([loadActivity(), api('/painel').then(({totais})=>{
        for (const indicator of document.querySelectorAll('[data-total]')) indicator.textContent = totais[indicator.dataset.total] ?? 0;
      }).catch(error => {
        summaryError.textContent = error.message;
        summaryError.hidden = false;
      })]);
    },
  };
}
