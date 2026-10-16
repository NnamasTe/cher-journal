(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const LARGURA = 1366;
  const ALTURA = 768;

  function ajustarEscala() {
    const s = Math.min(window.innerWidth / LARGURA, window.innerHeight / ALTURA);
    document.body.style.setProperty('--s', String(s));
  }
  window.addEventListener('resize', ajustarEscala);
  ajustarEscala();

  const params = new URLSearchParams(window.location.search);
  const journalId = params.get('id');

  const formatoData = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });

  async function api(caminho) {
    const resposta = await fetch(caminho, { headers: { 'Content-Type': 'application/json' } });
    if (resposta.status === 401) {
      window.location.replace('/');
      throw new Error('sessão encerrada');
    }
    if (resposta.status === 404) {
      window.location.replace('/estante.html');
      throw new Error('não encontrado');
    }
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(corpo.erro || 'Algo deu errado.');
    return corpo;
  }
  const CAMPO_TEXTO = 'anotacoes';

  const urlPaginas = `/api/journals/${encodeURIComponent(journalId || '')}/paginas`;
  const taEsq = $('textoEsq');
  const taDir = $('textoDir');
  const avisoFolha = $('avisoFolha');
  const anotTextoEl = $('anotTexto');

  let folhas = [];
  let esq = 1;
  let dataJournal = null;
  let ocupado = false;
  let saindo = false;
  let temporizadorAvisoFolha = null;
  const desfazer = [];
  const refazer = [];

  async function requisicao(caminho, opcoes = {}) {
    const resposta = await fetch(caminho, {
      headers: { 'Content-Type': 'application/json' },
      ...opcoes,
    });
    if (resposta.status === 401) {
      window.location.replace('/');
      throw new Error('sessão encerrada');
    }
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      const erro = new Error(corpo.erro || 'Algo deu errado.');
      erro.status = resposta.status;
      throw erro;
    }
    return corpo;
  }

  function avisarFolha(texto, ms = 2000) {
    avisoFolha.textContent = texto;
    avisoFolha.hidden = false;
    clearTimeout(temporizadorAvisoFolha);
    temporizadorAvisoFolha = setTimeout(() => {
      avisoFolha.hidden = true;
    }, ms);
  }


  const MARCA = '<!--cj1-->';
  const LINHA = 34;
  const CLASSE_FONT = { 1: 's-texto', 2: 's-texto', 3: 's-texto', 4: 's-sub', 5: 's-titulo', 6: 's-titulo', 7: 's-titulo' };
  const CLASSES = ['s-titulo', 's-sub', 's-texto'];
  const CORES = ['azul', 'rosa', 'amarelo', 'laranja', 'marrom', 'verde', 'preto'];
  const CLASSES_COR = CORES.map((c) => `c-${c}`);

  function percorrer(origem, destino) {
    for (const no of Array.from(origem.childNodes)) {
      if (no.nodeType === 3) {
        destino.appendChild(document.createTextNode(no.nodeValue));
        continue;
      }
      if (no.nodeType !== 1) continue;
      const tag = no.tagName.toLowerCase();
      let alvo = destino;
      if (tag === 'br') {
        destino.appendChild(document.createTextNode('\n'));
        continue;
      }
      if (tag === 'b' || tag === 'strong') alvo = document.createElement('b');
      else if (tag === 'i' || tag === 'em') alvo = document.createElement('i');
      else if (tag === 'u') alvo = document.createElement('u');
      else if (tag === 'span' && [...CLASSES, ...CLASSES_COR].some((c) => no.classList.contains(c))) {
        const classes = [...CLASSES, ...CLASSES_COR].filter((c) => no.classList.contains(c));
        alvo = document.createElement('span');
        alvo.className = classes.join(' ');
      } else if (tag === 'font' && CLASSE_FONT[no.getAttribute('size')]) {
        alvo = document.createElement('span');
        alvo.className = CLASSE_FONT[no.getAttribute('size')];
      }
      if (alvo !== destino) destino.appendChild(alvo);
      percorrer(no, alvo);
      if (alvo !== destino && !alvo.firstChild) alvo.remove();
      if (tag === 'div' || tag === 'p') destino.appendChild(document.createTextNode('\n'));
    }
  }

  function sanitizar(bruto) {
    const doc = new DOMParser().parseFromString(`<body>${bruto}`, 'text/html');
    const saida = document.createElement('div');
    percorrer(doc.body, saida);
    return saida.innerHTML;
  }

  function textoPuroParaHtml(texto) {
    const saida = document.createElement('div');
    saida.textContent = texto;
    return saida.innerHTML;
  }

  function normalizarTexto(texto) {
    if (texto.startsWith(MARCA)) return MARCA + sanitizar(texto.slice(MARCA.length));
    return texto ? MARCA + textoPuroParaHtml(texto) : '';
  }

  function htmlDoTexto(texto) {
    return texto.startsWith(MARCA) ? texto.slice(MARCA.length) : '';
  }

  function lerCampo(ed) {
    const html = sanitizar(ed.innerHTML);
    return ed.textContent === '' ? '' : MARCA + html;
  }

  function montarFolha(pagina) {
    const texto = normalizarTexto(String(pagina[CAMPO_TEXTO] || ''));
    return {
      id: pagina.id,
      data: pagina.data || new Date().toISOString(),
      texto,
      salvo: texto,
    };
  }

  async function criarFolha() {
    const resposta = await requisicao(urlPaginas, {
      method: 'POST',
      body: JSON.stringify({ data: new Date().toISOString() }),
    });
    folhas.push(montarFolha(resposta.pagina || resposta));
  }

  async function garantirFolhas(quantidade) {
    while (folhas.length < quantidade) await criarFolha();
  }

  async function enviarTexto(folha, texto) {
    const corpo = JSON.stringify({ [CAMPO_TEXTO]: texto });
    const id = encodeURIComponent(folha.id);
    let ultimo = null;
    for (const rota of [`${urlPaginas}/${id}`, `/api/paginas/${id}`]) {
      try {
        await requisicao(rota, { method: 'PATCH', body: corpo });
        return;
      } catch (erro) {
        if (erro.status !== 404 && erro.status !== 405) throw erro;
        ultimo = erro;
      }
    }
    throw ultimo;
  }

  function desenharFolhas() {
    const fe = folhas[esq - 1];
    const fd = folhas[esq];
    $('numEsq').textContent = String(esq);
    $('numDir').textContent = String(esq + 1);
    const base = fe ? fe.data : dataJournal;
    $('dataFolha').textContent = base ? formatoData.format(new Date(base)) : '';
    taEsq.innerHTML = fe ? htmlDoTexto(fe.texto) : '';
    taDir.innerHTML = fd ? htmlDoTexto(fd.texto) : '';
    taEsq.contentEditable = fe ? 'true' : 'false';
    taDir.contentEditable = fd ? 'true' : 'false';
  }

  async function carregar() {
    if (!journalId) {
      window.location.replace('/estante.html');
      return;
    }
    try {
      const id = encodeURIComponent(journalId);
      const [journal, paginas] = await Promise.all([
        api(`/api/journals/${id}`),
        api(`/api/journals/${id}/paginas`),
      ]);

      document.title = `${journal.titulo} · cher journal`;
      dataJournal = journal.data_Criacao;

      folhas = paginas
        .map((p, i) => ({ p, i }))
        .sort((x, y) => new Date(x.p.data) - new Date(y.p.data) || x.i - y.i)
        .map((x) => montarFolha(x.p));

      desenharFolhas();

      if (folhas.length < 2) {
        try {
          await garantirFolhas(2);
        } catch (erro) {
          if (erro.message !== 'sessão encerrada') avisarFolha('não foi possível criar as folhas.', 3500);
        }
        desenharFolhas();
      }
    } catch (_) {
    }
  }

  function registrar(indice, antes, depois, separar = false) {
    const agora = Date.now();
    const ultimo = desfazer[desfazer.length - 1];
    if (!separar && ultimo && ultimo.indice === indice && agora - ultimo.t < 700 &&
        Math.abs(depois.length - ultimo.antes.length) < 60) {
      ultimo.depois = depois;
      ultimo.t = agora;
    } else {
      desfazer.push({ indice, antes, depois, t: agora });
      if (desfazer.length > 300) desfazer.shift();
    }
    refazer.length = 0;
  }

  function caretNoFim(ed) {
    const r = document.createRange();
    r.selectNodeContents(ed);
    r.collapse(false);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  function aoEscrever(ed, indice, separar = false) {
    const folha = folhas[indice];
    if (!folha) return;
    const novo = lerCampo(ed);
    if (novo === folha.texto) return;

    if (ed.scrollHeight > ed.clientHeight + 1) {
      ed.innerHTML = htmlDoTexto(folha.texto);
      ed.focus();
      caretNoFim(ed);
      avisarFolha('a folha está cheia.');
      return;
    }

    registrar(indice, folha.texto, novo, separar);
    folha.texto = novo;
  }

  function medir(ed, no, deslocamento) {
    const r = document.createRange();
    r.setStart(ed, 0);
    r.setEnd(no, deslocamento);
    const c = document.createElement('div');
    c.appendChild(r.cloneContents());
    return c.textContent.length;
  }

  function localizar(ed, posicao) {
    let resto = posicao;
    const andador = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let no;
    while ((no = andador.nextNode())) {
      if (no.nodeType === 3) {
        if (resto <= no.nodeValue.length) return [no, resto];
        resto -= no.nodeValue.length;
      }
    }
    return [ed, ed.childNodes.length];
  }

  function selecionarTrecho(ed, a, b) {
    const r = document.createRange();
    const ini = localizar(ed, a);
    const fim = localizar(ed, b);
    r.setStart(ini[0], ini[1]);
    r.setEnd(fim[0], fim[1]);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  function linhaDoFim(ed) {
    const marcador = document.createElement('span');
    marcador.style.cssText = 'display:inline-block;width:0;height:0;line-height:0';
    ed.appendChild(marcador);
    const linha = Math.floor(marcador.offsetTop / LINHA);
    marcador.remove();
    return linha;
  }

  function terminaEmQuebra(ed) {
    return ed.textContent.endsWith('\n');
  }

  function clicarNaLinha(e, ed, indice) {
    if (ed.contentEditable !== 'true' || e.button !== 0) return;
    const caixa = ed.getBoundingClientRect();
    const escala = caixa.height / ed.offsetHeight || 1;
    const maxLinha = Math.floor(ed.clientHeight / LINHA) - 1;
    const alvo = Math.min(maxLinha, Math.floor((e.clientY - caixa.top) / escala / LINHA));
    const fim = linhaDoFim(ed);
    const quebra = terminaEmQuebra(ed);
    if (alvo < fim || (alvo === fim && !quebra)) return;
    if (alvo === 0 && !ed.firstChild) return;

    e.preventDefault();
    const novas = document.createTextNode('\n'.repeat(alvo - fim));
    ed.appendChild(novas);
    let posicao = null;
    if (terminaEmQuebra(ed)) {
      novas.nodeValue += '\n';
      posicao = [novas, novas.nodeValue.length - 1];
    }
    ed.focus();
    const r = document.createRange();
    if (posicao) {
      r.setStart(posicao[0], posicao[1]);
    } else {
      r.selectNodeContents(ed);
      r.collapse(false);
    }
    r.collapse(true);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    aoEscrever(ed, indice);
  }

  function ligarEscrita(ed, deslocamento) {
    const indice = () => esq - 1 + deslocamento;
    ed.addEventListener('input', (e) => {
      if (!e.isComposing) aoEscrever(ed, indice());
    });
    ed.addEventListener('compositionend', () => aoEscrever(ed, indice()));
    ed.addEventListener('mousedown', (e) => clicarNaLinha(e, ed, indice()));
    ed.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        document.execCommand('insertLineBreak');
      }
    });
    ed.addEventListener('paste', (e) => {
      e.preventDefault();
      const texto = (e.clipboardData || window.clipboardData).getData('text/plain').replace(/\r\n?/g, '\n');
      texto.split('\n').forEach((parte, i) => {
        if (i > 0) document.execCommand('insertLineBreak');
        if (parte) document.execCommand('insertText', false, parte);
      });
    });
    ed.addEventListener('drop', (e) => e.preventDefault());
  }
  ligarEscrita(taEsq, 0);
  ligarEscrita(taDir, 1);

  function aplicarHistorico(de, para, campo) {
    const entrada = de.pop();
    if (!entrada) return;
    para.push(entrada);
    const folha = folhas[entrada.indice];
    if (!folha) return;
    folha.texto = entrada[campo];
    if (desfazer.length) desfazer[desfazer.length - 1].t = 0; 
    esq = entrada.indice % 2 === 0 ? entrada.indice + 1 : entrada.indice;
    desenharFolhas();
    const ta = entrada.indice % 2 === 0 ? taEsq : taDir;
    ta.focus();
    caretNoFim(ta);
  }

  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (e.target === anotTextoEl || !$('palcoAnot').hidden) return; 
    const tecla = e.key.toLowerCase();
    if (tecla === 'z' && !e.shiftKey) {
      e.preventDefault();
      aplicarHistorico(desfazer, refazer, 'antes');
    } else if (tecla === 'y' || (tecla === 'z' && e.shiftKey)) {
      e.preventDefault();
      aplicarHistorico(refazer, desfazer, 'depois');
    }
  });

  function voltarFolha() {
    if (ocupado || esq <= 1) return;
    esq -= 2;
    desenharFolhas();
  }

  async function avancarFolha() {
    if (ocupado) return;
    ocupado = true;
    try {
      await garantirFolhas(esq + 3);
      esq += 2;
      desenharFolhas();
    } catch (erro) {
      if (erro.message !== 'sessão encerrada') avisarFolha('não foi possível criar a folha.', 3500);
    } finally {
      ocupado = false;
    }
  }

  function haAlteracoes() {
    return folhas.some((f) => f.texto !== f.salvo);
  }

  async function salvar() {
    if (ocupado) return;
    const pendentes = folhas.filter((f) => f.texto !== f.salvo);
    if (pendentes.length === 0) {
      avisarFolha('tudo salvo!');
      return;
    }
    ocupado = true;
    try {
      for (const folha of pendentes) {
        const texto = folha.texto;
        await enviarTexto(folha, texto);
        folha.salvo = texto;
      }
      avisarFolha('salvo com sucesso!');
    } catch (erro) {
      if (erro.message !== 'sessão encerrada') avisarFolha('não foi possível salvar. tente de novo.', 3500);
    } finally {
      ocupado = false;
    }
  }

  function irParaEstante() {
    if (haAlteracoes() && !window.confirm('há alterações não salvas. sair mesmo assim?')) return;
    saindo = true;
    window.location.href = '/estante.html';
  }

  window.addEventListener('beforeunload', (e) => {
    if (!saindo && haAlteracoes()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  $('btnVoltar').addEventListener('click', voltarFolha);
  $('btnAvancar').addEventListener('click', avancarFolha);
  $('btnSalvar').addEventListener('click', salvar);
  $('btnEstante').addEventListener('click', irParaEstante);

  const chaveAnotacoes = `cher-journal:anotacoes:${journalId}`;
  const LIMITE_ANOTACOES = 445;

  const anotTexto = $('anotTexto');
  const anotAviso = $('anotAviso');
  let temporizadorAviso = null;

  function lerAnotacoes() {
    try {
      return (localStorage.getItem(chaveAnotacoes) || '').slice(0, LIMITE_ANOTACOES);
    } catch (_) {
      return '';
    }
  }

  function salvarAnotacoes() {
    try {
      localStorage.setItem(chaveAnotacoes, anotTexto.value);
    } catch (_) {
    }
  }

  function mostrarAviso(texto) {
    anotAviso.textContent = texto;
    anotAviso.hidden = false;
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => {
      anotAviso.hidden = true;
    }, 2000);
  }

  function abrirAnotacoes() {
    anotTexto.value = lerAnotacoes();
    anotAviso.hidden = true;
    $('anotFundo').hidden = false;
    $('palcoAnot').hidden = false;
    $('palco').inert = true;
    anotTexto.focus();
  }

  function fecharAnotacoes() {
    salvarAnotacoes();
    clearTimeout(temporizadorAviso);
    anotAviso.hidden = true;
    $('palcoAnot').hidden = true;
    $('anotFundo').hidden = true;
    $('palco').inert = false;
    $('btnAnotacoes').focus();
  }

  async function copiarAnotacoes() {
    const texto = anotTexto.value;
    if (!texto) {
      mostrarAviso('não há nada para copiar.');
      return;
    }
    try {
      await navigator.clipboard.writeText(texto);
    } catch (_) {
      anotTexto.select();
      if (!document.execCommand('copy')) {
        mostrarAviso('não foi possível copiar.');
        return;
      }
      anotTexto.setSelectionRange(texto.length, texto.length);
    }
    mostrarAviso('copiado com sucesso!');
    anotTexto.focus();
  }

  anotTexto.addEventListener('input', salvarAnotacoes);
  $('btnAnotacoes').addEventListener('click', abrirAnotacoes);
  $('btnCopiar').addEventListener('click', copiarAnotacoes);
  $('btnOk').addEventListener('click', fecharAnotacoes);

  const painel = $('painelEscrever');
  const botoesBloqueados = () => Array.from(document.querySelectorAll('#palco .item'));

  function abrirEscrever() {
    painel.hidden = false;
    botoesBloqueados().forEach((b) => { b.inert = true; });
  }

  function fecharEscrever() {
    painel.hidden = true;
    botoesBloqueados().forEach((b) => { b.inert = false; });
    $('btnEscrever').focus();
  }

  function campoSelecionado() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const r = sel.getRangeAt(0);
    for (const ed of [taEsq, taDir]) {
      if (ed.contentEditable === 'true' && ed.contains(r.commonAncestorContainer)) {
        return { ed, r, indice: esq - 1 + (ed === taDir ? 1 : 0) };
      }
    }
    return null;
  }

  function aplicarFormato(comando, valor) {
    const campo = campoSelecionado();
    if (!campo || campo.r.collapsed) {
      avisarFolha('selecione um trecho do texto.');
      return;
    }
    const { ed, r, indice } = campo;
    const a = medir(ed, r.startContainer, r.startOffset);
    const b = medir(ed, r.endContainer, r.endOffset);
    ed.focus();
    document.execCommand('styleWithCSS', false, false);
    document.execCommand(comando, false, valor);
    ed.querySelectorAll('font[size]').forEach((f) => {
      const span = document.createElement('span');
      span.className = CLASSE_FONT[f.getAttribute('size')] || 's-texto';
      while (f.firstChild) span.appendChild(f.firstChild);
      f.replaceWith(span);
    });
    selecionarTrecho(ed, a, b);
    aoEscrever(ed, indice, true);
  }

  const TAMANHOS = { titulo: '5', subtitulo: '4', texto: '3' };

  painel.addEventListener('mousedown', (e) => e.preventDefault());
  painel.querySelectorAll('[data-tamanho]').forEach((b) =>
    b.addEventListener('click', () => aplicarFormato('fontSize', TAMANHOS[b.dataset.tamanho])));
  painel.querySelectorAll('[data-tipo]').forEach((b) =>
    b.addEventListener('click', () => aplicarFormato(b.dataset.tipo)));
  $('btnEscrever').addEventListener('click', abrirEscrever);
  $('btnOkEscrever').addEventListener('click', fecharEscrever);

  const gizes = $('gizes');
  const estrela = $('estrela');
  let corAtual = null;

  function abrirCores() {
    gizes.hidden = false;
    botoesBloqueados().forEach((b) => { b.inert = true; });
  }

  function fecharCores() {
    gizes.hidden = true;
    botoesBloqueados().forEach((b) => { b.inert = false; });
    $('btnCores').focus();
  }

  function marcarEstrela(botao) {
    const topo = parseFloat(botao.style.top);
    const altura = parseFloat(botao.style.height);
    estrela.style.top = `${topo + (altura - 24) / 2}px`;
    estrela.removeAttribute('hidden');
  }

  function envoltoraDeCor(no, ed) {
    const el = no.nodeType === 1 ? no : no.parentElement;
    const alvo = el && el.closest(CLASSES_COR.map((c) => `.${c}`).join(','));
    return alvo && ed.contains(alvo) ? alvo : null;
  }

  function abrirBordas(r, ed) {
    const ini = envoltoraDeCor(r.startContainer, ed);
    if (ini) {
      const esquerda = document.createRange();
      esquerda.setStart(ini, 0);
      esquerda.setEnd(r.startContainer, r.startOffset);
      if (!esquerda.collapsed) {
        const copia = ini.cloneNode(false);
        copia.appendChild(esquerda.extractContents());
        ini.parentNode.insertBefore(copia, ini);
      }
      r.setStartBefore(ini);
    }
    const fim = envoltoraDeCor(r.endContainer, ed);
    if (fim) {
      const direita = document.createRange();
      direita.setStart(r.endContainer, r.endOffset);
      direita.setEnd(fim, fim.childNodes.length);
      if (!direita.collapsed) {
        const copia = fim.cloneNode(false);
        copia.appendChild(direita.extractContents());
        fim.parentNode.insertBefore(copia, fim.nextSibling);
      }
      r.setEndAfter(fim);
    }
  }

  function todoNaCor(ed, r, cor) {
    const andador = document.createTreeWalker(r.commonAncestorContainer.nodeType === 3
      ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer, NodeFilter.SHOW_TEXT);
    let achou = false;
    let no;
    while ((no = andador.nextNode())) {
      if (!r.intersectsNode(no) || !no.nodeValue) continue;
      if (no === r.endContainer && r.endOffset === 0) continue;
      if (no === r.startContainer && r.startOffset === no.nodeValue.length) continue;
      achou = true;
      const dono = envoltoraDeCor(no, ed);
      if (!dono || !dono.classList.contains(`c-${cor}`)) return false;
    }
    if (!achou) {
      const dono = envoltoraDeCor(r.commonAncestorContainer, ed);
      return !!dono && dono.classList.contains(`c-${cor}`);
    }
    return true;
  }

  function colorir(cor) {
    const campo = campoSelecionado();
    if (!campo || campo.r.collapsed) {
      avisarFolha('selecione um trecho do texto.');
      return;
    }
    const { ed, r, indice } = campo;
    const remover = todoNaCor(ed, r, cor);
    abrirBordas(r, ed);

    const fragmento = r.extractContents();
    fragmento.querySelectorAll(CLASSES_COR.map((c) => `.${c}`).join(',')).forEach((s) => {
      while (s.firstChild) s.parentNode.insertBefore(s.firstChild, s);
      s.remove();
    });

    let primeiro;
    let ultimo;
    if (remover) {
      primeiro = fragmento.firstChild;
      ultimo = fragmento.lastChild;
      r.insertNode(fragmento);
    } else {
      const marca = document.createElement('span');
      marca.className = `c-${cor}`;
      marca.appendChild(fragmento);
      r.insertNode(marca);
      primeiro = ultimo = marca;
    }
    if (primeiro && ultimo) {
      const nova = document.createRange();
      nova.setStartBefore(primeiro);
      nova.setEndAfter(ultimo);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(nova);
    }
    aoEscrever(ed, indice, true);
  }

  gizes.addEventListener('mousedown', (e) => e.preventDefault());
  gizes.querySelectorAll('.giz').forEach((b) =>
    b.addEventListener('click', () => {
      corAtual = b.dataset.cor;
      marcarEstrela(b);
      colorir(corAtual);
    }));
  $('btnCores').addEventListener('click', abrirCores);
  $('btnOkCores').addEventListener('click', fecharCores);

  carregar();
})();
