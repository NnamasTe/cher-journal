(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const ORDENS = ['recentes', 'antigos', 'titulo'];
  const ROTULO_ORDEM = {
    recentes: 'mais recentes primeiro',
    antigos: 'mais antigos primeiro',
    titulo: 'ordem alfabética',
  };
  const PROPORCAO_CAPA = 260 / 369;

  const estado = {
    journals: [],
    ordem: 'recentes',
    busca: '',
    editando: false, // modo "editar journals"
    selecionado: null, // journal aberto na janela de edição
    carregado: false,
    ocupado: false,
  };

  const el = {
    grade: $('grade'),
    vazio: $('vazio'),
    semResultado: $('semResultado'),
    busca: $('busca'),
    aviso: $('aviso'),
    overlay: $('overlay'),
    btnCriar: $('btnCriar'),
    btnCriarVazio: $('btnCriarVazio'),
    btnEditar: $('btnEditar'),
    btnOrdenar: $('btnOrdenar'),
    janelaCriar: $('janelaCriar'),
    janelaEditar: $('janelaEditar'),
    formCriar: $('formCriar'),
    formEditar: $('formEditar'),
    tituloNovo: $('tituloNovo'),
    dataHoje: $('dataHoje'),
    erroCriar: $('erroCriar'),
    erroEditar: $('erroEditar'),
    tituloSel: $('tituloSel'),
    btnCapa: $('btnCapa'),
    btnTitulo: $('btnTitulo'),
    btnApagar: $('btnApagar'),
    arquivoCapa: $('arquivoCapa'),
  };

  const formatoData = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });

  function dataCurta(valor, separador = '/') {
    return formatoData.format(new Date(valor)).replace(/\//g, separador);
  }

  function normalizar(texto) {
    return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  }

  async function api(caminho, opcoes = {}) {
    const resposta = await fetch(caminho, {
      headers: { 'Content-Type': 'application/json' },
      ...opcoes,
    });
    if (resposta.status === 401) {
      window.location.replace('/');
      throw new Error('sessão encerrada');
    }
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(corpo.erro || 'Algo deu errado.');
    return corpo;
  }

  let timerAviso = null;
  function avisar(texto, ms) {
    clearTimeout(timerAviso);
    el.aviso.textContent = texto;
    if (ms) timerAviso = setTimeout(restaurarAviso, ms);
  }
  function restaurarAviso() {
    el.aviso.textContent = estado.editando ? 'clique no journal que deseja editar' : '';
  }


  function criarItem(journal) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'journal';

    const meta = document.createElement('span');
    meta.className = 'meta';
    const data = document.createElement('span');
    data.className = 'data';
    data.textContent = dataCurta(journal.data_Criacao);
    const paginas = document.createElement('span');
    paginas.className = 'paginas';
    paginas.textContent =
      journal.qttd_Paginas === 1 ? '1 página' : `${journal.qttd_Paginas} páginas`;
    meta.append(data, paginas);

    const capa = document.createElement('img');
    capa.className = 'capa';
    capa.alt = '';
    capa.loading = 'lazy';
    capa.src = journal.capa;
    capa.addEventListener('error', () => { capa.src = '/capa-padrao.png'; }, { once: true });

    const titulo = document.createElement('span');
    titulo.className = 'titulo';
    titulo.textContent = journal.titulo;

    item.append(meta, capa, titulo);
    item.addEventListener('click', () => {
      if (estado.editando) abrirEditar(journal);
    });
    return item;
  }

  function desenhar() {
    const termo = normalizar(estado.busca.trim());
    const lista = termo
      ? estado.journals.filter((j) => normalizar(j.titulo).includes(termo))
      : estado.journals;

    el.grade.replaceChildren(...lista.map(criarItem));
    el.grade.classList.toggle('editando', estado.editando);

    const semJournals = estado.carregado && estado.journals.length === 0;
    el.vazio.hidden = !semJournals;
    el.grade.hidden = semJournals;
    el.semResultado.hidden = !(estado.journals.length > 0 && lista.length === 0);
  }

  async function carregar() {
    try {
      estado.journals = await api(`/api/journals?ordem=${estado.ordem}`);
      estado.carregado = true;
    } catch (erro) {
      if (erro.message !== 'sessão encerrada') {
        avisar('não foi possível carregar os journals.', 5000);
      }
    }
    desenhar();
  }

  let focoAnterior = null;
  let janelaAberta = null;

  function abrirJanela(janela, primeiroCampo) {
    focoAnterior = document.activeElement;
    janelaAberta = janela;
    el.overlay.hidden = false;
    janela.hidden = false;
    if (primeiroCampo) primeiroCampo.focus();
  }

  function fecharJanela() {
    if (!janelaAberta) return;
    el.janelaCriar.hidden = true;
    el.janelaEditar.hidden = true;
    el.overlay.hidden = true;
    janelaAberta = null;
    estado.selecionado = null;
    estado.ocupado = false;
    if (focoAnterior && document.contains(focoAnterior)) focoAnterior.focus();
  }

  function sairDoModoEditar() {
    estado.editando = false;
    el.btnEditar.setAttribute('aria-pressed', 'false');
    restaurarAviso();
    desenhar();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (janelaAberta) fecharJanela();
      else if (estado.editando) sairDoModoEditar();
      return;
    }
    if (e.key === 'Tab' && janelaAberta) {
      const foco = [...janelaAberta.querySelectorAll('button, input:not([hidden])')]
        .filter((c) => !c.disabled);
      if (foco.length === 0) return;
      const primeiro = foco[0];
      const ultimo = foco[foco.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }
  });

  el.overlay.addEventListener('click', fecharJanela);
  document.querySelectorAll('[data-fechar]').forEach((b) => b.addEventListener('click', fecharJanela));

  function abrirCriar() {
    el.tituloNovo.value = '';
    el.tituloNovo.placeholder = 'inserir título_';
    el.erroCriar.textContent = '';
    el.dataHoje.textContent = dataCurta(new Date(), '.');
    abrirJanela(el.janelaCriar, el.tituloNovo);
  }

  el.btnCriar.addEventListener('click', abrirCriar);
  el.btnCriarVazio.addEventListener('click', abrirCriar);

  el.formCriar.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (estado.ocupado) return;
    const titulo = el.tituloNovo.value.trim();
    if (!titulo) {
      el.tituloNovo.placeholder = 'dê um título_';
      el.tituloNovo.focus();
      return;
    }
    estado.ocupado = true;
    el.erroCriar.textContent = '';
    try {
      await api('/api/journals', { method: 'POST', body: JSON.stringify({ titulo }) });
      fecharJanela();
      el.busca.value = '';
      estado.busca = '';
      await carregar();
    } catch (erro) {
      if (erro.message !== 'sessão encerrada') {
        el.erroCriar.textContent = 'não foi possível criar. tente de novo.';
      }
      estado.ocupado = false;
    }
  });

  let timerApagar = null;

  function abrirEditar(journal) {
    estado.selecionado = journal;
    el.tituloSel.value = journal.titulo;
    el.tituloSel.readOnly = true;
    el.tituloSel.classList.remove('editando');
    el.erroEditar.textContent = '';
    el.btnApagar.textContent = 'apagar journal';
    clearTimeout(timerApagar);
    abrirJanela(el.janelaEditar, el.btnCapa);
  }

  function trocarTextoTemporario(botao, texto, original, ms) {
    botao.textContent = texto;
    setTimeout(() => { botao.textContent = original; }, ms);
  }

  el.btnTitulo.addEventListener('click', () => {
    el.tituloSel.readOnly = false;
    el.tituloSel.classList.add('editando');
    el.tituloSel.focus();
    el.tituloSel.select();
  });

  el.btnApagar.addEventListener('click', async () => {
    if (!estado.selecionado || estado.ocupado) return;

    if (el.btnApagar.dataset.confirmar !== '1') {
      el.btnApagar.dataset.confirmar = '1';
      el.btnApagar.textContent = 'clique de novo para apagar';
      clearTimeout(timerApagar);
      timerApagar = setTimeout(() => {
        el.btnApagar.dataset.confirmar = '';
        el.btnApagar.textContent = 'apagar journal';
      }, 4000);
      return;
    }

    clearTimeout(timerApagar);
    el.btnApagar.dataset.confirmar = '';
    estado.ocupado = true;
    try {
      await api(`/api/journals/${encodeURIComponent(estado.selecionado.id)}`, { method: 'DELETE' });
      fecharJanela();
      sairDoModoEditar();
      await carregar();
    } catch (erro) {
      if (erro.message !== 'sessão encerrada') {
        el.erroEditar.textContent = 'não foi possível apagar. tente de novo.';
      }
      el.btnApagar.textContent = 'apagar journal';
      estado.ocupado = false;
    }
  });

  el.formEditar.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!estado.selecionado || estado.ocupado) return;

    const novoTitulo = el.tituloSel.value.trim();
    const atual = estado.selecionado;

    if (!novoTitulo || novoTitulo === atual.titulo) {
      fecharJanela();
      sairDoModoEditar();
      return;
    }

    estado.ocupado = true;
    try {
      await api(`/api/journals/${encodeURIComponent(atual.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ titulo: novoTitulo }),
      });
      fecharJanela();
      sairDoModoEditar();
      await carregar();
    } catch (erro) {
      if (erro.message !== 'sessão encerrada') {
        el.erroEditar.textContent = 'não foi possível salvar o título. tente de novo.';
      }
      estado.ocupado = false;
    }
  });

  async function prepararCapa(arquivo) {
    const imagem = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
    let { width: l, height: a } = imagem;
    let sx = 0;
    let sy = 0;
    if (l / a > PROPORCAO_CAPA) {
      const nova = Math.round(a * PROPORCAO_CAPA);
      sx = Math.round((l - nova) / 2);
      l = nova;
    } else {
      const nova = Math.round(l / PROPORCAO_CAPA);
      sy = Math.round((a - nova) / 2);
      a = nova;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 520;
    canvas.height = Math.round(520 / PROPORCAO_CAPA);
    canvas.getContext('2d').drawImage(imagem, sx, sy, l, a, 0, 0, canvas.width, canvas.height);
    imagem.close();
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('falha ao preparar a imagem'))),
        'image/jpeg', 0.88);
    });
  }

  el.btnCapa.addEventListener('click', () => {
    if (!estado.ocupado) el.arquivoCapa.click();
  });

  el.arquivoCapa.addEventListener('change', async () => {
    const arquivo = el.arquivoCapa.files[0];
    el.arquivoCapa.value = '';
    if (!arquivo || !estado.selecionado || estado.ocupado) return;

    const original = 'upload de capa';
    estado.ocupado = true;
    el.erroEditar.textContent = '';
    el.btnCapa.disabled = true;
    el.btnCapa.textContent = 'enviando...';
    try {
      const imagem = await prepararCapa(arquivo);
      const envio = await fetch('/api/uploads/capa', {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg' },
        body: imagem,
      });
      if (envio.status === 401) { window.location.replace('/'); return; }
      const dados = await envio.json().catch(() => ({}));
      if (!envio.ok) throw new Error(dados.erro || 'falha no envio');

      await api(`/api/journals/${encodeURIComponent(estado.selecionado.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ capa: dados.url }),
      });
      el.btnCapa.disabled = false;
      trocarTextoTemporario(el.btnCapa, 'capa atualizada', original, 1800);
      await carregar();
      estado.selecionado = estado.journals.find((j) => j.id === estado.selecionado.id) || estado.selecionado;
    } catch (erro) {
      if (erro.message !== 'sessão encerrada') {
        el.erroEditar.textContent = 'não foi possível enviar a capa. tente de novo.';
      }
      el.btnCapa.disabled = false;
      el.btnCapa.textContent = original;
    } finally {
      estado.ocupado = false;
    }
  });

  el.btnEditar.addEventListener('click', () => {
    if (estado.editando) {
      sairDoModoEditar();
      return;
    }
    if (estado.journals.length === 0) {
      avisar('ainda não há journals para editar.', 2500);
      return;
    }
    estado.editando = true;
    el.btnEditar.setAttribute('aria-pressed', 'true');
    restaurarAviso();
    desenhar();
  });

  el.btnOrdenar.addEventListener('click', async () => {
    estado.ordem = ORDENS[(ORDENS.indexOf(estado.ordem) + 1) % ORDENS.length];
    await carregar();
    avisar(`ordem: ${ROTULO_ORDEM[estado.ordem]}`, 2500);
  });

  el.busca.addEventListener('input', () => {
    estado.busca = el.busca.value;
    desenhar();
  });

  carregar();
})();
