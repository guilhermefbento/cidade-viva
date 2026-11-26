export function connectAddress(form, { selectPoint }) {
  const field = form.elements.endereco;
  const button = form.querySelector('#address-search');
  const feedback = form.querySelector('#address-feedback');
  const results = form.querySelector('#address-results');
  let request;
  let linked = false;

  function cancel() {
    request?.abort();
    request = undefined;
    button.disabled = false;
    results.replaceChildren();
    results.hidden = true;
  }

  function clear(keepText = false) {
    cancel();
    if (!keepText || linked) field.value = '';
    linked = false;
    feedback.textContent = '';
  }

  async function fetchAddress(path, params, pendingText, onResult) {
    cancel();
    const controller = new AbortController();
    request = controller;
    button.disabled = true;
    feedback.textContent = pendingText;
    try {
      const response = await fetch('/api/endereco/' + path + '?' + new URLSearchParams(params), { signal: controller.signal });
      const data = await response.json();
      if (request !== controller) return;
      if (!response.ok) throw new Error(data.erro || 'Não foi possível buscar o endereço.');
      onResult(data);
    } catch (error) {
      if (request === controller) feedback.textContent = ['TypeError','SyntaxError'].includes(error.name)
        ? 'Não foi possível buscar o endereço. Marque o local no mapa e, se quiser, digite uma referência.'
        : error.message + (path === 'ponto' ? ' O local continua marcado. Se souber o endereço, preencha o campo.' : '');
    } finally {
      if (request === controller) {
        request = undefined;
        button.disabled = false;
      }
    }
  }

  function choose(result) {
    cancel();
    if(!selectPoint(result.latitude,result.longitude,true)) {
      feedback.textContent = 'Esse endereço fica fora da cidade de São Paulo. Marque outro local.';
      return;
    }
    linked = true;
    field.value = result.endereco;
    feedback.textContent = result.aproximado
      ? 'Encontramos um local aproximado. Confira o marcador no mapa.'
      : 'Encontramos o endereço e marcamos no mapa.';
    field.focus({preventScroll:true});
  }

  function search() {
    const q = field.value.trim();
    if (q.length < 4) {
      feedback.textContent = 'Digite pelo menos quatro caracteres. Rua, número e bairro ajudam a localizar.';
      field.focus();
      return;
    }
    fetchAddress('busca', { q }, 'Buscando endereços em São Paulo…', ({resultados}) => {
      if (!resultados.length) {
        feedback.textContent = 'Não encontramos esse endereço na cidade de São Paulo. Confira a grafia ou marque o local no mapa.';
        return;
      }
      if (resultados.length === 1) return choose(resultados[0]);
      for (const result of resultados) {
        const option = document.createElement('li');
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'quiet';
        action.textContent = result.endereco;
        action.onclick = () => choose(result);
        option.append(action);
        results.append(option);
      }
      results.hidden = false;
      feedback.textContent = 'Selecione uma das opções abaixo para marcar o local.';
    });
  }

  button.onclick = search;
  field.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); if(!button.disabled) search(); }
  });
  field.addEventListener('input', () => {
    cancel();
    if (linked) {
      linked = false;
      selectPoint(null,null,false);
      feedback.textContent = 'Você mudou o endereço. Busque de novo ou marque o novo local no mapa.';
    } else {
      feedback.textContent = '';
    }
  });

  return {
    clear,
    pending: () => Boolean(request),
    point(latitude,longitude,keepText=false) {
      clear(keepText);
      fetchAddress('ponto',{lat:latitude,lng:longitude},'Buscando o endereço do local marcado…',({resultado})=>{
        if (!resultado) {
          feedback.textContent = 'O local está marcado. Não encontramos o endereço, mas você pode digitá-lo no campo acima.';
          return;
        }
        linked = true;
        field.value = resultado.endereco;
        feedback.textContent = 'O endereço é aproximado. O marcador continua no ponto que você escolheu.';
      });
    },
  };
}
