(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const LARGURA = 1366;
  const ALTURA = 768;

  const toqueGrosso = window.matchMedia('(pointer: coarse)');
  let girado = false;
  let escPalco = 1;

  function emRetrato() {
    const o = window.screen && window.screen.orientation;
    if (o && o.type) return o.type.startsWith('portrait');
    return window.screen.height > window.screen.width;
  }

  function ajustarEscala() {
    girado = toqueGrosso.matches && emRetrato();
    document.body.classList.toggle('paisagem-forcada', girado);
    const s = girado
      ? Math.min(window.innerHeight / LARGURA, window.innerWidth / ALTURA)
      : Math.min(window.innerWidth / LARGURA, window.innerHeight / ALTURA);
    escPalco = s;
    document.body.style.setProperty('--s', String(s));
  }
  window.addEventListener('resize', ajustarEscala);
  window.addEventListener('orientationchange', ajustarEscala);
  if (window.screen && window.screen.orientation) {
    window.screen.orientation.addEventListener('change', ajustarEscala);
  }
  ajustarEscala();

  try {
    if (window.screen.orientation && window.screen.orientation.lock) {
      window.screen.orientation.lock('landscape').catch(() => {});
    }
  } catch (_) { }

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

  const PAPEIS = {
    padrao: '/journal-cena.png',
    espiral: '/journal-cena-espiral.png',
    bege: '/journal-cena-bege.png',
  };
  let papel = 'padrao';

  function montarFolha(pagina) {
    const texto = normalizarTexto(String(pagina[CAMPO_TEXTO] || ''));
    const textura = Object.prototype.hasOwnProperty.call(PAPEIS, pagina.textura_Pag) ? pagina.textura_Pag : 'padrao';
    const adesivos = Array.isArray(pagina.adesivos) ? pagina.adesivos.map(limparAdesivo).filter(Boolean) : [];
    return {
      id: pagina.id,
      data: pagina.data || new Date().toISOString(),
      texto,
      salvo: texto,
      textura,
      texturaSalva: textura,
      adesivos,
      adesivosSalvo: serialAd(adesivos),
    };
  }

  function novaFolhaLocal() {
    return {
      id: null,
      data: new Date().toISOString(),
      texto: '',
      salvo: '',
      textura: papel,
      texturaSalva: papel,
      adesivos: [],
      adesivosSalvo: serialAd([]),
    };
  }

  let sincronizacaoNovas = null;

  async function sincronizarNovas() {
    if (sincronizacaoNovas) {
      await sincronizacaoNovas;
      if (folhas.some((f) => f.id == null)) return sincronizarNovas();
      return;
    }

    const sincronizacao = (async () => {
      for (const f of folhas) {
        if (f.id != null) continue;
        const resposta = await requisicao(urlPaginas, {
          method: 'POST',
          body: JSON.stringify({ data: f.data, textura_Pag: f.textura }),
        });
        f.id = (resposta.pagina || resposta).id;
      }
    })();
    sincronizacaoNovas = sincronizacao;
    try {
      await sincronizacao;
    } finally {
      if (sincronizacaoNovas === sincronizacao) sincronizacaoNovas = null;
    }
  }

  function sincronizarNovasEmSegundoPlano() {
    sincronizarNovas().catch((erro) => {
      if (erro.message !== 'sessão encerrada') avisarFolha('não foi possível criar as folhas.', 3500);
    });
  }

  function garantirFolhas(quantidade) {
    while (folhas.length < quantidade) folhas.push(novaFolhaLocal());
  }

  async function enviarTexto(folha, texto, textura, adesivos) {
    const corpo = JSON.stringify({ [CAMPO_TEXTO]: texto, textura_Pag: textura, adesivos: JSON.parse(adesivos) });
    await requisicao(`/api/paginas/${encodeURIComponent(folha.id)}`, { method: 'PATCH', body: corpo });
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
    desenharAdesivos();
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

      papel = folhas.length ? folhas[0].textura : 'padrao';
      aplicarPapel();
      desenharFolhas();

      if (folhas.length < 2) {
        garantirFolhas(2);
        desenharFolhas();
        sincronizarNovasEmSegundoPlano();
      }
    } catch (_) {
    }
  }

  function registrar(mudancas, separar = false) {
    const agora = Date.now();
    const ultimo = desfazer[desfazer.length - 1];
    const mesmas = ultimo && ultimo.itens.length === mudancas.length &&
      ultimo.itens.every((it, n) => it.indice === mudancas[n].indice);
    if (!separar && mesmas && agora - ultimo.t < 700 &&
        Math.abs(mudancas[0].depois.length - ultimo.itens[0].antes.length) < 60) {
      ultimo.itens.forEach((it, n) => { it.depois = mudancas[n].depois; });
      ultimo.t = agora;
    } else {
      desfazer.push({ itens: mudancas, t: agora });
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

    if (excedeFolha(ed)) {
      transbordar(ed, indice, novo, separar);
      return;
    }

    registrar([{ indice, antes: folha.texto, depois: novo }], separar);
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

  function excedeFolha(ed) {
    if (ed.scrollHeight > ed.clientHeight + 1) return true;
    if (!terminaEmQuebra(ed)) return false;
    return linhaDoFim(ed) - 1 >= Math.floor(ed.clientHeight / LINHA);
  }
  const LIMITE_TRANSBORDO = 400;
  const ALCANCE_PALAVRA = 40;

  function criarMedidor(indice) {
    const par = indice - (indice % 2);
    const blocos = [par, par + 1]
      .filter((k) => folhas[k])
      .flatMap((k) => folhas[k].adesivos)
      .map((a) => blocoColisao(a));
    const caixa = document.createElement('div');
    caixa.className = `caixa-folha ${indice % 2 === 0 ? 'texto-esq' : 'texto-dir'}`;
    caixa.style.visibility = 'hidden';
    const col = document.createElement('div');
    col.className = 'colisao';
    const medidor = document.createElement('div');
    medidor.className = 'texto-folha';
    caixa.append(col, medidor);
    $('palco').appendChild(caixa);
    montarColisao(caixa, col, blocos);
    return {
      cabe(html) {
        medidor.innerHTML = `${html}<span style="display:inline-block;width:1px;height:1px"></span>`;
        return medidor.scrollHeight <= medidor.clientHeight + 1;
      },
      remover() { caixa.remove(); },
    };
  }

  function dividirHtml(html, posicao) {
    const raiz = document.createElement('div');
    raiz.innerHTML = html;
    const [no, deslocamento] = localizar(raiz, posicao);
    const r = document.createRange();
    r.setStart(no, deslocamento);
    r.setEnd(raiz, raiz.childNodes.length);
    const cauda = document.createElement('div');
    cauda.appendChild(r.extractContents());
    return [sanitizar(raiz.innerHTML), sanitizar(cauda.innerHTML)];
  }

  function pontoDeCorte(medidor, html) {
    const raiz = document.createElement('div');
    raiz.innerHTML = html;
    const texto = raiz.textContent;
    let lo = 0;
    let hi = texto.length - 1;
    while (lo < hi) {
      const meio = Math.ceil((lo + hi) / 2);
      if (medidor.cabe(dividirHtml(html, meio)[0])) lo = meio;
      else hi = meio - 1;
    }
    let k = lo;
    if (texto[k] === '\n') return k + 1;
    if (k > 0 && !/\s/.test(texto[k - 1]) && !/\s/.test(texto[k])) {
      const ate = texto.slice(0, k);
      const espaco = Math.max(ate.lastIndexOf(' '), ate.lastIndexOf('\n'));
      if (espaco >= 0 && k - espaco <= ALCANCE_PALAVRA) k = espaco + 1;
    }
    return k;
  }

  function paraTexto(html) {
    const t = document.createElement('div');
    t.innerHTML = html;
    return t.textContent === '' ? '' : MARCA + sanitizar(html);
  }

  function posicaoDoCaret(ed) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const r = sel.getRangeAt(0);
    if (!ed.contains(r.startContainer)) return null;
    return medir(ed, r.startContainer, r.startOffset);
  }

  function colocarCaret(ed, posicao) {
    const [no, deslocamento] = localizar(ed, posicao);
    const r = document.createRange();
    r.setStart(no, deslocamento);
    r.collapse(true);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  function transbordar(ed, indice, novo, separar) {
    const textosAntes = folhas.map((f) => f.texto);
    const totalAntes = folhas.length;
    const htmls = folhas.map((f) => htmlDoTexto(f.texto));
    htmls[indice] = htmlDoTexto(novo);

    let cursor = { i: indice, pos: posicaoDoCaret(ed) };
    let i = indice;
    let cortes = 0;
    let cheia = false;

    while (cortes < LIMITE_TRANSBORDO) {
      const medidor = criarMedidor(i);
      let k = 0;
      let partes = null;
      try {
        if (!medidor.cabe(htmls[i])) {
          k = pontoDeCorte(medidor, htmls[i]);
          if (k > 0) partes = dividirHtml(htmls[i], k);
          else cheia = true;
        }
      } finally {
        medidor.remover();
      }
      if (cheia || !partes) break;

      if (!folhas[i + 1]) {
        folhas.push(novaFolhaLocal());
        htmls.push('');
      }
      const [cabeca, cauda] = partes;
      const ladoTexto = document.createElement('div');
      ladoTexto.innerHTML = cabeca;
      const levaCursor = cursor.i === i && cursor.pos !== null &&
        (cursor.pos > k || (cursor.pos === k && ladoTexto.textContent.endsWith('\n')));

      htmls[i] = cabeca;
      htmls[i + 1] = cauda + htmls[i + 1];
      if (levaCursor) cursor = { i: i + 1, pos: cursor.pos - k };
      cortes += 1;
      i += 1;
    }

    if (cheia || cortes >= LIMITE_TRANSBORDO) {
      folhas.length = totalAntes;
      ed.innerHTML = htmlDoTexto(textosAntes[indice]);
      ed.focus();
      caretNoFim(ed);
      avisarFolha('a folha está cheia.');
      return;
    }

    if (cortes === 0) {
      registrar([{ indice, antes: folhas[indice].texto, depois: novo }], separar);
      folhas[indice].texto = novo;
      return;
    }

    const mudancas = [];
    for (let j = indice; j <= i; j++) {
      const depois = paraTexto(htmls[j]);
      mudancas.push({ indice: j, antes: textosAntes[j] === undefined ? '' : textosAntes[j], depois });
      folhas[j].texto = depois;
    }
    registrar(mudancas, separar);

    if (cursor.pos !== null) esq = cursor.i % 2 === 0 ? cursor.i + 1 : cursor.i;
    desenharFolhas();
    if (cursor.pos !== null) {
      const alvo = cursor.i % 2 === 0 ? taEsq : taDir;
      alvo.focus();
      colocarCaret(alvo, cursor.pos);
    }
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
    const escala = (girado ? caixa.width : caixa.height) / ed.offsetHeight || 1;
    const yTela = girado ? caixa.right - e.clientX : e.clientY - caixa.top;
    const maxLinha = Math.floor(ed.clientHeight / LINHA) - 1;
    const alvo = Math.min(maxLinha, Math.floor(yTela / escala / LINHA));
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
    const principal = entrada.itens[0];
    if (!folhas[principal.indice]) return;
    entrada.itens.forEach((it) => {
      if (folhas[it.indice]) folhas[it.indice].texto = it[campo];
    });
    if (desfazer.length) desfazer[desfazer.length - 1].t = 0; 
    esq = principal.indice % 2 === 0 ? principal.indice + 1 : principal.indice;
    desenharFolhas();
    const ta = principal.indice % 2 === 0 ? taEsq : taDir;
    ta.focus();
    caretNoFim(ta);
  }

  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (editandoAd || e.target === anotTextoEl || !$('palcoAnot').hidden) return; 
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

  function avancarFolha() {
    if (ocupado) return;
    ocupado = true;
    try {
      garantirFolhas(esq + 3);
      esq += 2;
      desenharFolhas();
      sincronizarNovasEmSegundoPlano();
    } finally {
      ocupado = false;
    }
  }

  function folhaPendente(f) {
    return f.id == null || f.texto !== f.salvo || f.textura !== f.texturaSalva ||
      serialAd(f.adesivos) !== f.adesivosSalvo;
  }

  function haAlteracoes() {
    return folhas.some(folhaPendente);
  }

  async function salvar() {
    if (ocupado || editandoAd) return;
    const pendentes = folhas.filter(folhaPendente);
    if (pendentes.length === 0) {
      avisarFolha('tudo salvo!');
      return;
    }
    ocupado = true;
    try {
      await sincronizarNovas();
      for (const folha of pendentes) {
        const texto = folha.texto;
        const textura = folha.textura;
        const adesivos = serialAd(folha.adesivos);
        await enviarTexto(folha, texto, textura, adesivos);
        folha.salvo = texto;
        folha.texturaSalva = textura;
        folha.adesivosSalvo = adesivos;
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

  const painelPapeis = $('papeis');
  const imgCena = document.querySelector('.cena-img');
  const opsPapel = Array.from(painelPapeis.querySelectorAll('[data-papel]'));

  function aplicarPapel() {
    imgCena.src = PAPEIS[papel];
    document.body.classList.toggle('papel-espiral', papel === 'espiral');
    document.body.classList.toggle('papel-bege', papel === 'bege');
    opsPapel.forEach((b) => b.classList.toggle('selecionado', b.dataset.papel === papel));
  }

  function textoCabe(adesivosPorFolha) {
    const palco = $('palco');
    return folhas.every((f, i) => {
      const par = i - (i % 2);
      const blocos = [par, par + 1]
        .filter((k) => folhas[k])
        .flatMap((k) => (adesivosPorFolha ? adesivosPorFolha[k] : folhas[k].adesivos))
        .map((a) => blocoColisao(a));
      const caixa = document.createElement('div');
      caixa.className = `caixa-folha ${i % 2 === 0 ? 'texto-esq' : 'texto-dir'}`;
      caixa.style.visibility = 'hidden';
      const col = document.createElement('div');
      col.className = 'colisao';
      const medidor = document.createElement('div');
      medidor.className = 'texto-folha';
      medidor.innerHTML = htmlDoTexto(f.texto);
      caixa.append(col, medidor);
      palco.appendChild(caixa);
      montarColisao(caixa, col, blocos);
      const cabe = medidor.scrollHeight <= medidor.clientHeight + 1;
      caixa.remove();
      return cabe;
    });
  }

  function escolherPapel(novo) {
    if (novo === papel) return;
    const anterior = papel;
    papel = novo;
    aplicarPapel();
    // onde cada adesivo ficará no papel novo (o centro é reajustado à área do papel)
    const ajustados = folhas.map((f) => f.adesivos.map((a) => {
      const [x, y] = centroValido(a.x, a.y);
      return { ...a, x: arred(x), y: arred(y) };
    }));
    if (!textoCabe(ajustados)) {
      papel = anterior;
      aplicarPapel();
      avisarFolha('o texto não cabe nesse papel.', 3000);
      return;
    }
    folhas.forEach((f) => {
      f.textura = papel;
      f.adesivos.forEach((a) => { [a.x, a.y] = centroValido(a.x, a.y); a.x = arred(a.x); a.y = arred(a.y); });
    });
    desenharAdesivos();
  }

  function travarFundo(travar) {
    botoesBloqueados().forEach((b) => { b.inert = travar; });
    [taEsq, taDir].forEach((t) => { t.inert = travar; });
  }

  function abrirPapeis() {
    Object.values(PAPEIS).forEach((src) => { new Image().src = src; });
    painelPapeis.hidden = false;
    travarFundo(true);
  }

  function fecharPapeis() {
    painelPapeis.hidden = true;
    travarFundo(false);
    $('btnTipos').focus();
  }

  opsPapel.forEach((b) => b.addEventListener('click', () => escolherPapel(b.dataset.papel)));
  $('btnTipos').addEventListener('click', abrirPapeis);
  $('btnOkPapeis').addEventListener('click', fecharPapeis);

  const camadaAd = $('adCamada');
  const selAd = $('adSel');
  const barAd = $('adBar');
  const okAd = $('btnOkAdesivos');
  const arqAd = $('arqAdesivo');

  const TIPOS_AD = ['image/png', 'image/jpeg', 'image/webp'];
  const LIMITE_AD = 20;
  const LIMITE_BYTES_AD = 4 * 1024 * 1024;
  const LADO_MIN = 24;
  const LADO_MAX = 1000;
  const LADO_INICIAL = 220;
  const OPACIDADE_PADRAO = 100;

  const PAPEL_AD = {
    padrao: {
      recorte: [[226, 33], [1138, 33], [1138, 735], [226, 735]],
      caixa: { x1: 226, x2: 1138, y1: 33, y2: 735 },
      divisa: 683,
      centros: [454, 908],
    },
    bege: {
      recorte: [[206, 8], [1137, 8], [1139, 600], [1124, 735], [1000, 746], [206, 746]],
      caixa: { x1: 206, x2: 1137, y1: 8, y2: 746 },
      divisa: 668,
      centros: [446, 899],
    },
    espiral: {
      recorte: [
        [176, 8], [640, 8], [640, 738], [176, 738],
      ],
      recorte2: [[735, 8], [1189, 8], [1174, 300], [1158, 600], [1128, 736], [735, 736]],
      caixa: { x1: 176, x2: 1189, y1: 8, y2: 738 },
      divisa: 690,
      centros: [418, 952],
      argola: [640, 735],
    },
  };
  const areaAd = () => PAPEL_AD[papel] || PAPEL_AD.padrao;

  function centroValido(x, y) {
    const a = areaAd();
    let cx = limitar(x, a.caixa.x1, a.caixa.x2);
    const cy = limitar(y, a.caixa.y1, a.caixa.y2);
    if (a.argola && cx > a.argola[0] && cx < a.argola[1]) {
      cx = cx - a.argola[0] < a.argola[1] - cx ? a.argola[0] : a.argola[1];
    }
    return [cx, cy];
  }

  let editandoAd = false;
  let apagandoAd = false;
  let enviandoAd = false;
  let selecionadoAd = null;
  let cortando = null; // id do adesivo cujo modo de corte está ligado
  let ultimoFoco = taEsq;
  const pendentesAd = new Map();
  const histAd = [];
  const refAd = [];
  const elsAd = new Map();

  const arred = (n) => Math.round(n * 10) / 10;
  const limitar = (n, min, max) => Math.min(max, Math.max(min, n));
  const novoId = () => (window.crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

  function normalizarGraus(g) {
    let r = g % 360;
    if (r > 180) r -= 360;
    if (r <= -180) r += 360;
    return r;
  }

  const CORTE_MAX = 0.95;

  function limparCorte(c) {
    const f = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? limitar(n, 0, CORTE_MAX) : 0;
    };
    const r = { esq: f(c && c.esq), dir: f(c && c.dir), cima: f(c && c.cima), baixo: f(c && c.baixo) };
    [['esq', 'dir'], ['cima', 'baixo']].forEach(([a, b]) => {
      const soma = r[a] + r[b];
      if (soma > CORTE_MAX) {
        r[a] *= CORTE_MAX / soma;
        r[b] *= CORTE_MAX / soma;
      }
    });
    Object.keys(r).forEach((k) => { r[k] = Math.round(r[k] * 10000) / 10000; });
    return r;
  }

  function limparAdesivo(a) {
    if (!a || typeof a.src !== 'string' || !a.src) return null;
    const num = (v, padrao) => (Number.isFinite(Number(v)) ? Number(v) : padrao);
    return {
      id: typeof a.id === 'string' && a.id ? a.id : novoId(),
      src: a.src,
      x: arred(num(a.x, 450)),
      y: arred(num(a.y, 380)),
      w: arred(limitar(num(a.w, LADO_INICIAL), LADO_MIN, LADO_MAX)),
      h: arred(limitar(num(a.h, LADO_INICIAL), LADO_MIN, LADO_MAX)),
      rot: arred(normalizarGraus(num(a.rot, 0))),
      espelho: !!a.espelho,
      opacidade: Math.round(limitar(
        a.opacidade === null || a.opacidade === '' ? OPACIDADE_PADRAO : num(a.opacidade, OPACIDADE_PADRAO),
        0,
        100,
      )),
      corte: limparCorte(a.corte),
    };
  }

  function serialAd(lista) {
    return JSON.stringify(lista.map(limparAdesivo).filter(Boolean));
  }

  function achar(id) {
    if (!id) return null;
    for (const f of folhas) {
      const s = f.adesivos.find((a) => a.id === id);
      if (s) return { s, folha: f };
    }
    return null;
  }

  function indicesVisiveis() {
    return [esq - 1, esq].filter((i) => folhas[i]);
  }

  function temAdesivosVisiveis() {
    return indicesVisiveis().some((i) => folhas[i].adesivos.length > 0);
  }

  const FOLGA_COLISAO = 4;
  const ESCALA_COLISAO = 1;
  const VAO_MIN = 56;
  const PAD_FOLHA = 4;
  const NS_SVG = 'http://www.w3.org/2000/svg';

  const caixaEsq = $('caixaEsq');
  const caixaDir = $('caixaDir');
  const colEsq = $('colEsq');
  const colDir = $('colDir');
  const verColisao = params.has('colisao');
  let svgColisao = null;

  function blocoColisao(s) {
    const t = (s.rot * Math.PI) / 180;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    const mw = (s.w * ESCALA_COLISAO) / 2 + FOLGA_COLISAO;
    const mh = (s.h * ESCALA_COLISAO) / 2 + FOLGA_COLISAO;
    return [[-mw, -mh], [mw, -mh], [mw, mh], [-mw, mh]]
      .map(([dx, dy]) => [s.x + dx * cos - dy * sin, s.y + dx * sin + dy * cos]);
  }

  function extensaoNaFaixa(pts, ya, yb) {
    const eps = 0.01;
    let min = Infinity;
    let max = -Infinity;
    const usar = (x) => {
      if (x < min) min = x;
      if (x > max) max = x;
    };
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      if (y1 > ya + eps && y1 < yb - eps) usar(x1);
      for (const y of [ya + eps, yb - eps]) {
        if ((y1 < y && y2 > y) || (y1 > y && y2 < y)) usar(x1 + ((x2 - x1) * (y - y1)) / (y2 - y1));
      }
    }
    return min <= max ? [min, max] : null;
  }

  function calcularFaixas(caixa, blocos) {
    const largura = caixa.offsetWidth;
    const x0 = caixa.offsetLeft;
    const y0 = caixa.offsetTop;
    const linhas = Math.floor(caixa.offsetHeight / LINHA);
    const ini0 = PAD_FOLHA;
    const fim0 = largura - PAD_FOLHA;

    const textoADireita = blocos.map((pts) => {
      const xs = pts.map((p) => p[0] - x0);
      return fim0 - Math.max(...xs) >= Math.min(...xs) - ini0;
    });

    const porLinha = [];
    for (let r = 0; r < linhas; r++) {
      const ya = y0 + r * LINHA;
      const yb = ya + LINHA;
      let ini = ini0;
      let fim = fim0;
      let tocou = false;
      blocos.forEach((pts, i) => {
        const ext = extensaoNaFaixa(pts, ya, yb);
        if (!ext) return;
        const mn = ext[0] - x0;
        const mx = ext[1] - x0;
        if (mx <= ini0 || mn >= fim0) return;
        tocou = true;
        if (textoADireita[i]) ini = Math.max(ini, mx);
        else fim = Math.min(fim, mn);
      });
      if (!tocou) {
        porLinha.push([0, 0]);
      } else if (fim - ini < VAO_MIN) {
        porLinha.push([largura, 0]);
      } else {
        porLinha.push([ini > ini0 ? Math.ceil(ini) : 0, fim < fim0 ? Math.ceil(largura - fim) : 0]);
      }
    }

    const faixas = [];
    porLinha.forEach(([esq, dir], r) => {
      if (!esq && !dir) return;
      const ultima = faixas[faixas.length - 1];
      if (ultima && ultima.ate === r && ultima.esq === esq && ultima.dir === dir) ultima.ate = r + 1;
      else faixas.push({ de: r, ate: r + 1, esq, dir });
    });
    return faixas;
  }

  function montarColisao(caixa, col, blocos) {
    const faixas = calcularFaixas(caixa, blocos);
    const assinatura = JSON.stringify(faixas);
    if (col.dataset.assinatura === assinatura) return;
    col.dataset.assinatura = assinatura;
    col.textContent = '';
    let fundo = 0;
    faixas.forEach((f) => {
      const topo = f.de * LINHA;
      const altura = (f.ate - f.de) * LINHA;
      const margem = topo - fundo;
      fundo = topo + altura;
      let primeiro = true;
      [['esq', f.esq], ['dir', f.dir]].forEach(([lado, largura]) => {
        if (!largura) return;
        const b = document.createElement('i');
        b.className = `col-bloco col-${lado}`;
        b.style.cssText = `width:${largura}px;height:${altura}px;margin-top:${margem}px;${primeiro ? 'clear:both;' : ''}`;
        col.appendChild(b);
        primeiro = false;
      });
    });
  }

  function blocosVisiveis() {
    return indicesVisiveis().flatMap((i) => folhas[i].adesivos.map(blocoColisao));
  }

  function atualizarColisao() {
    const blocos = blocosVisiveis();
    montarColisao(caixaEsq, colEsq, blocos);
    montarColisao(caixaDir, colDir, blocos);
    if (verColisao) desenharColisao(blocos);
  }

  function desenharColisao(blocos) {
    document.body.classList.add('colisao-ver');
    if (!svgColisao) {
      svgColisao = document.createElementNS(NS_SVG, 'svg');
      svgColisao.setAttribute('class', 'colisao-debug');
      svgColisao.setAttribute('viewBox', `0 0 ${LARGURA} ${ALTURA}`);
      $('palco').appendChild(svgColisao);
    }
    svgColisao.textContent = '';
    blocos.forEach((pts) => {
      const poligono = document.createElementNS(NS_SVG, 'polygon');
      poligono.setAttribute('points', pts.map((p) => p.join(',')).join(' '));
      svgColisao.appendChild(poligono);
    });
  }

  function excessoTexto() {
    return [taEsq, taDir].reduce((total, ed) => total + Math.max(0, ed.scrollHeight - ed.clientHeight - 1), 0);
  }

  function aplicarSePossivel(s, novo, base) {
    const antes = { x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rot, corte: s.corte };
    Object.assign(s, novo);
    atualizarColisao();
    if (excessoTexto() <= base) return true;
    Object.assign(s, antes);
    atualizarColisao();
    return false;
  }

  function posicionarNovo(folha, s, x, y, escalas = [1]) {
    const base = excessoTexto();
    const a = areaAd();
    const lado = folhas.indexOf(folha) === esq - 1 ? 0 : 1;
    const xi = lado === 0 ? a.caixa.x1 : a.divisa;
    const xf = lado === 0 ? a.divisa : a.caixa.x2;
    const grade = [];
    for (let gx = xi + 20; gx <= xf - 20; gx += 40) {
      for (let gy = a.caixa.y1 + 20; gy <= a.caixa.y2 - 20; gy += 40) grade.push([gx, gy]);
    }
    grade.sort((p, q) => Math.hypot(p[0] - x, p[1] - y) - Math.hypot(q[0] - x, q[1] - y));
    const candidatos = [[x, y], ...grade];
    const w0 = s.w;
    const h0 = s.h;
    folha.adesivos.push(s);
    for (const k of escalas) {
      s.w = arred(Math.max(LADO_MIN, w0 * k));
      s.h = arred(Math.max(LADO_MIN, h0 * k));
      for (const [cx, cy] of candidatos) {
        [s.x, s.y] = centroValido(cx, cy);
        s.x = arred(s.x);
        s.y = arred(s.y);
        atualizarColisao();
        if (excessoTexto() <= base) return true;
      }
    }
    folha.adesivos.pop();
    s.w = w0;
    s.h = h0;
    atualizarColisao();
    return false;
  }

  const AVISO_SEM_ESPACO = 'o texto não cabe com o adesivo aí.';

  function estiloAd(s, el) {
    el.style.left = `${s.x - s.w / 2}px`;
    el.style.top = `${s.y - s.h / 2}px`;
    el.style.width = `${s.w}px`;
    el.style.height = `${s.h}px`;
    el.style.transform = `rotate(${s.rot}deg)`;
    const img = el.firstChild;
    img.style.transform = s.espelho ? 'scaleX(-1)' : '';
    el.style.opacity = String(s.opacidade / 100);

    const c = s.corte;
    if (c && (c.esq || c.dir || c.cima || c.baixo)) {
      const esqTela = s.espelho ? c.dir : c.esq;
      const iw = s.w / (1 - c.esq - c.dir);
      const ih = s.h / (1 - c.cima - c.baixo);
      Object.assign(img.style, {
        position: 'absolute',
        maxWidth: 'none',
        width: `${iw}px`,
        height: `${ih}px`,
        left: `${-esqTela * iw}px`,
        top: `${-c.cima * ih}px`,
      });
      el.style.overflow = 'hidden';
    } else {
      Object.assign(img.style, { position: '', maxWidth: '', width: '', height: '', left: '', top: '' });
      el.style.overflow = '';
    }
  }

  function desenharAdesivos() {
    camadaAd.textContent = '';
    elsAd.clear();
    indicesVisiveis().forEach((i) => {
      folhas[i].adesivos.forEach((s) => {
        const el = document.createElement('div');
        el.className = 'adesivo';
        el.style.touchAction = 'none';
        const img = document.createElement('img');
        img.alt = '';
        img.draggable = false;
        img.src = s.src;
        el.appendChild(img);
        el.dataset.id = s.id;
        el.addEventListener('pointerdown', (e) => aoApertarAdesivo(e, s.id));
        camadaAd.appendChild(el);
        elsAd.set(s.id, el);
        estiloAd(s, el);
      });
    });
    atualizarColisao();
    atualizarSel();
  }

  function atualizarEl(s) {
    const el = elsAd.get(s.id);
    if (el) estiloAd(s, el);
  }

  const sliderOpac = $('adOpacidade');
  const valorOpac = $('adOpacidadeValor');

  function mostrarOpacidade(valor) {
    sliderOpac.value = String(valor);
    valorOpac.textContent = `${valor}%`;
  }

  function atualizarSel() {
    const achado = editandoAd && !apagandoAd ? achar(selecionadoAd) : null;
    if (!achado) {
      selAd.hidden = true;
      barAd.hidden = true;
      return;
    }
    const s = achado.s;
    const modoCorte = cortando === s.id;
    selAd.classList.toggle('cortando', modoCorte);
    const btnCorte = barAd.querySelector('[data-acao="cortar"]');
    if (btnCorte) btnCorte.setAttribute('aria-pressed', String(modoCorte));
    mostrarOpacidade(s.opacidade);
    selAd.style.left = `${s.x - s.w / 2}px`;
    selAd.style.top = `${s.y - s.h / 2}px`;
    selAd.style.width = `${s.w}px`;
    selAd.style.height = `${s.h}px`;
    selAd.style.transform = `rotate(${s.rot}deg)`;
    selAd.hidden = false;

    const t = (s.rot * Math.PI) / 180;
    const alturaCaixa = Math.abs(s.w * Math.sin(t)) + Math.abs(s.h * Math.cos(t));
    barAd.hidden = false;
    const lb = barAd.offsetWidth;
    const ab = barAd.offsetHeight;
    let topo = s.y + alturaCaixa / 2 + 14;
    if (topo + ab > ALTURA - 4) topo = s.y - alturaCaixa / 2 - 52 - ab;
    barAd.style.left = `${limitar(s.x - lb / 2, 4, LARGURA - lb - 4)}px`;
    barAd.style.top = `${limitar(topo, 4, ALTURA - ab - 4)}px`;
  }

  function paraPalco(e) {
    const r = $('palco').getBoundingClientRect();
    const esc = escPalco || 1;
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    if (girado) {
      return { x: dy / esc + LARGURA / 2, y: -dx / esc + ALTURA / 2 };
    }
    return { x: dx / esc + LARGURA / 2, y: dy / esc + ALTURA / 2 };
  }

  const fotoAd = () => JSON.stringify(folhas.map((f) => f.adesivos));

  function guardarAd(antes) {
    histAd.push(antes);
    if (histAd.length > 100) histAd.shift();
    refAd.length = 0;
  }

  function mutarAd(fn) {
    const antes = fotoAd();
    fn();
    if (fotoAd() !== antes) guardarAd(antes);
  }

  function restaurarAd(json) {
    const arr = JSON.parse(json);
    folhas.forEach((f, i) => { f.adesivos = arr[i] || []; });
    if (!achar(selecionadoAd)) selecionadoAd = null;
    desenharAdesivos();
  }

  function desfazerAd() {
    if (!histAd.length) return;
    refAd.push(fotoAd());
    restaurarAd(histAd.pop());
  }

  function refazerAd() {
    if (!refAd.length) return;
    histAd.push(fotoAd());
    restaurarAd(refAd.pop());
  }

  function entrarEdicaoAd() {
    if (editandoAd) return;
    editandoAd = true;
    camadaAd.classList.add('editando');
    okAd.hidden = false;
    okAd.disabled = false;
    botoesBloqueados().forEach((b) => {
      b.inert = b.id !== 'btnApagar' && b.id !== 'btnAdesivos';
    });
    [taEsq, taDir].forEach((t) => { t.inert = true; });
    histAd.length = 0;
    refAd.length = 0;
  }

  function sairEdicaoAd() {
    editandoAd = false;
    apagandoAd = false;
    selecionadoAd = null;
    cortando = null;
    camadaAd.classList.remove('editando', 'apagando');
    okAd.hidden = true;
    botoesBloqueados().forEach((b) => { b.inert = false; });
    [taEsq, taDir].forEach((t) => { t.inert = false; });
    histAd.length = 0;
    refAd.length = 0;
    atualizarSel();
    $('btnAdesivos').focus();
  }

  function selecionarAd(id) {
    if (cortando !== id) cortando = null;
    selecionadoAd = id;
    atualizarSel();
  }

  function carregarImagem(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('imagem inválida'));
      img.src = url;
    });
  }

  function paraBlob(canvas, tipo, qualidade) {
    return new Promise((resolve) => canvas.toBlob(resolve, tipo, qualidade));
  }

  async function prepararImagem(arquivo) {
    const urlOriginal = URL.createObjectURL(arquivo);
    try {
      const img = await carregarImagem(urlOriginal);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) throw new Error('imagem inválida');
      const maior = Math.max(w, h);
      if (arquivo.size <= LIMITE_BYTES_AD && maior <= 2400) {
        return { blob: arquivo, url: urlOriginal, w, h };
      }
      const k = Math.min(1, 1600 / maior);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * k));
      canvas.height = Math.max(1, Math.round(h * k));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      let blob = await paraBlob(canvas, arquivo.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.92);
      if (blob && blob.size > LIMITE_BYTES_AD) blob = await paraBlob(canvas, 'image/webp', 0.9);
      if (!blob || blob.size === 0 || blob.size > LIMITE_BYTES_AD || !TIPOS_AD.includes(blob.type)) {
        throw new Error('imagem grande demais');
      }
      URL.revokeObjectURL(urlOriginal);
      return { blob, url: URL.createObjectURL(blob), w: canvas.width, h: canvas.height };
    } catch (erro) {
      URL.revokeObjectURL(urlOriginal);
      throw erro;
    }
  }

  function paginaAlvoAd() {
    return ultimoFoco === taDir && folhas[esq] ? esq : esq - 1;
  }

  async function adicionarArquivos(arquivos) {
    entrarEdicaoAd();
    apagandoAd = false;
    camadaAd.classList.remove('apagando');
    for (const arquivo of arquivos) {
      if (!TIPOS_AD.includes(arquivo.type)) {
        avisarFolha('use imagens PNG, JPEG ou WebP.', 3000);
        continue;
      }
      const indice = paginaAlvoAd();
      const folha = folhas[indice];
      if (!folha) {
        avisarFolha('não foi possível adicionar o adesivo.', 3000);
        break;
      }
      if (folha.adesivos.length >= LIMITE_AD) {
        avisarFolha(`limite de ${LIMITE_AD} adesivos por folha.`, 3000);
        break;
      }
      let pronto;
      try {
        pronto = await prepararImagem(arquivo);
      } catch (_) {
        avisarFolha('não foi possível abrir essa imagem.', 3000);
        continue;
      }
      if (!editandoAd) {
        URL.revokeObjectURL(pronto.url);
        return;
      }
      pendentesAd.set(pronto.url, pronto.blob);
      if (!inserirAdesivo(pronto.url, pronto.w, pronto.h, indice)) {
        pendentesAd.delete(pronto.url);
        URL.revokeObjectURL(pronto.url);
        break;
      }
    }
  }

  function inserirAdesivo(src, largura, altura, indice) {
    const folha = folhas[indice];
    if (!folha) return false;
    const k = Math.min(2, LADO_INICIAL / Math.max(largura, altura));
    const desloc = (folha.adesivos.length % 6) * 18;
    const s = limparAdesivo({
      id: novoId(),
      src,
      x: areaAd().centros[indice === esq - 1 ? 0 : 1] + desloc,
      y: 380 + desloc,
      w: largura * k,
      h: altura * k,
      rot: 0,
      espelho: false,
    });
    let coube = false;
    mutarAd(() => { coube = posicionarNovo(folha, s, s.x, s.y, [1, 0.6]); });
    if (!coube) {
      avisarFolha('não há espaço livre nessa folha para o adesivo.', 3500);
      return false;
    }
    selecionadoAd = s.id;
    desenharAdesivos();
    return true;
  }

  const CHAVE_RECENTES = 'cher-journal:adesivos-recentes';
  const MAX_RECENTES = 3;
  const popRecentes = $('adRecentes');
  let temporizadorRecentes = null;

  function lerRecentes() {
    try {
      const lista = JSON.parse(localStorage.getItem(CHAVE_RECENTES) || '[]');
      return Array.isArray(lista)
        ? lista.filter((u) => typeof u === 'string' && u.startsWith('https://')).slice(0, MAX_RECENTES)
        : [];
    } catch (_) {
      return [];
    }
  }

  function guardarRecentes(lista) {
    try {
      localStorage.setItem(CHAVE_RECENTES, JSON.stringify(lista.slice(0, MAX_RECENTES)));
    } catch (_) {
    }
  }

  function registrarRecente(url) {
    if (typeof url !== 'string' || !url.startsWith('https://')) return;
    guardarRecentes([url, ...lerRecentes().filter((u) => u !== url)]);
  }

  function esquecerRecente(url) {
    guardarRecentes(lerRecentes().filter((u) => u !== url));
    desenharRecentes();
  }

  function desenharRecentes() {
    const lista = lerRecentes();
    popRecentes.textContent = '';
    lista.forEach((url) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'adrec-op';
      b.setAttribute('aria-label', 'usar adesivo recente');
      const img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      img.addEventListener('error', () => esquecerRecente(url));
      img.src = url;
      b.appendChild(img);
      b.addEventListener('click', () => usarRecente(url, img));
      popRecentes.appendChild(b);
    });
    if (!lista.length) popRecentes.hidden = true;
  }

  function mostrarRecentes() {
    clearTimeout(temporizadorRecentes);
    if (!lerRecentes().length || enviandoAd) return;
    desenharRecentes();
    popRecentes.hidden = !lerRecentes().length;
  }

  function esconderRecentes(atraso = 250) {
    clearTimeout(temporizadorRecentes);
    temporizadorRecentes = setTimeout(() => { popRecentes.hidden = true; }, atraso);
  }

  function usarRecente(url, img) {
    const largura = img.naturalWidth;
    const altura = img.naturalHeight;
    if (!largura || !altura) return;
    const indice = paginaAlvoAd();
    const folha = folhas[indice];
    if (!folha) return;
    if (folha.adesivos.length >= LIMITE_AD) {
      avisarFolha(`limite de ${LIMITE_AD} adesivos por folha.`, 3000);
      return;
    }
    popRecentes.hidden = true;
    entrarEdicaoAd();
    apagandoAd = false;
    camadaAd.classList.remove('apagando');
    registrarRecente(url);
    inserirAdesivo(url, largura, altura, indice);
  }

  const btnAdesivosEl = $('btnAdesivos');
  btnAdesivosEl.addEventListener('mouseenter', mostrarRecentes);
  btnAdesivosEl.addEventListener('mouseleave', () => esconderRecentes());
  btnAdesivosEl.addEventListener('focus', mostrarRecentes);
  btnAdesivosEl.addEventListener('blur', () => esconderRecentes(150));
  popRecentes.addEventListener('mouseenter', () => clearTimeout(temporizadorRecentes));
  popRecentes.addEventListener('mouseleave', () => esconderRecentes());
  popRecentes.addEventListener('focusin', () => clearTimeout(temporizadorRecentes));
  popRecentes.addEventListener('focusout', () => esconderRecentes(150));

  async function enviarAdesivo(blob) {
    const resposta = await requisicao('/api/uploads/adesivo', {
      method: 'POST',
      headers: { 'Content-Type': blob.type },
      body: blob,
    });
    if (!resposta.url) throw new Error('resposta inválida');
    return resposta.url;
  }

  async function confirmarAdesivos() {
    if (enviandoAd) return;
    selecionadoAd = null;
    atualizarSel();
    const usados = new Set();
    folhas.forEach((f) => f.adesivos.forEach((a) => {
      if (a.src.startsWith('blob:')) usados.add(a.src);
    }));
    if (usados.size) {
      enviandoAd = true;
      okAd.disabled = true;
      avisarFolha('enviando adesivos...', 15000);
      try {
        for (const url of usados) {
          const blob = pendentesAd.get(url);
          if (!blob) throw new Error('arquivo perdido');
          const nova = await enviarAdesivo(blob);
          await carregarImagem(nova).catch(() => null);
          folhas.forEach((f) => f.adesivos.forEach((a) => { if (a.src === url) a.src = nova; }));
          pendentesAd.delete(url);
          URL.revokeObjectURL(url);
          registrarRecente(nova);
        }
      } catch (erro) {
        if (erro.message !== 'sessão encerrada') {
          avisarFolha(erro.status === 413 ? 'imagem grande demais.' : 'não foi possível enviar o adesivo. tente de novo.', 3500);
        }
        okAd.disabled = false;
        enviandoAd = false;
        desenharAdesivos();
        return;
      }
      avisoFolha.hidden = true;
      enviandoAd = false;
    }
    pendentesAd.forEach((_, url) => URL.revokeObjectURL(url));
    pendentesAd.clear();
    desenharAdesivos();
    sairEdicaoAd();
  }

  function aoApertarAdesivo(e, id) {
    if (!editandoAd || e.button !== 0) return;
    e.preventDefault();
    if (apagandoAd) {
      removerAd(id);
      return;
    }
    selecionarAd(id);
    comecarGesto(e, 'mover');
  }

  function reatribuirPagina(s) {
    const achado = achar(s.id);
    if (!achado) return;
    const alvo = esq - 1 + (s.x >= areaAd().divisa && folhas[esq] ? 1 : 0);
    const destino = folhas[alvo];
    if (destino === achado.folha) return;
    if (destino.adesivos.length >= LIMITE_AD) return;
    achado.folha.adesivos.splice(achado.folha.adesivos.indexOf(s), 1);
    destino.adesivos.push(s);
  }

  function capturarToque(el, e) {
    try {
      if (el && el.setPointerCapture) el.setPointerCapture(e.pointerId);
    } catch (_) { }
  }

  function comecarCorte(e, alca) {
    const achado = achar(selecionadoAd);
    if (!achado || e.button !== 0) return;
    e.preventDefault();
    capturarToque(alca, e);
    const s = achado.s;
    const antes = fotoAd();
    const ini = { x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rot, corte: limparCorte(s.corte) };
    const lado = alca.dataset.lado;
    const horizontal = lado === 'esq' || lado === 'dir';
    const ladoImg = s.espelho && horizontal ? (lado === 'esq' ? 'dir' : 'esq') : lado;
    const sinal = lado === 'esq' || lado === 'cima' ? 1 : -1;
    const t = (ini.rot * Math.PI) / 180;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    const c0 = ini.corte;
    const tam0 = horizontal ? ini.w : ini.h;
    const fatia = horizontal ? 1 - c0.esq - c0.dir : 1 - c0.cima - c0.baixo;
    const px = tam0 / fatia;
    const maxFora = Math.min(c0[ladoImg] * px, Math.max(0, LADO_MAX - tam0));
    const maxDentro = Math.max(0, tam0 - Math.max(LADO_MIN, (1 - CORTE_MAX) * px));
    const base = excessoTexto();
    let valido = { x: s.x, y: s.y, w: s.w, h: s.h, corte: s.corte };

    const mover = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      const p = paraPalco(ev);
      const vx = p.x - ini.x;
      const vy = p.y - ini.y;
      const pos = horizontal ? vx * cos + vy * sin : -vx * sin + vy * cos;
      const dentro = limitar(sinal * pos + tam0 / 2, -maxFora, maxDentro);
      const desloc = (sinal * dentro) / 2;
      const novo = {
        w: arred(horizontal ? tam0 - dentro : ini.w),
        h: arred(horizontal ? ini.h : tam0 - dentro),
        x: arred(horizontal ? ini.x + desloc * cos : ini.x - desloc * sin),
        y: arred(horizontal ? ini.y + desloc * sin : ini.y + desloc * cos),
        corte: { ...c0, [ladoImg]: Math.max(0, c0[ladoImg] + dentro / px) },
      };
      if (aplicarSePossivel(s, novo, base)) {
        valido = { x: s.x, y: s.y, w: s.w, h: s.h, corte: s.corte };
      } else {
        avisarFolha(AVISO_SEM_ESPACO, 1500);
      }
      atualizarEl(s);
      atualizarSel();
    };

    const fim = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', fim);
      window.removeEventListener('pointercancel', fim);
      Object.assign(s, limparAdesivo(s));
      atualizarColisao();
      if (excessoTexto() > base) Object.assign(s, limparAdesivo({ ...s, ...valido }));
      if (fotoAd() !== antes) guardarAd(antes);
      desenharAdesivos();
    };

    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', fim);
    window.addEventListener('pointercancel', fim);
  }

  function comecarGesto(e, tipo, alca) {
    if (tipo === 'cortar') {
      comecarCorte(e, alca);
      return;
    }
    const achado = achar(selecionadoAd);
    if (!achado || e.button !== 0) return;
    e.preventDefault();
    const s = achado.s;
    const antes = fotoAd();
    const ini = { ...s };
    const p0 = paraPalco(e);
    const t = (ini.rot * Math.PI) / 180;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    const sx = alca ? Number(alca.dataset.sx) : 0;
    const sy = alca ? Number(alca.dataset.sy) : 0;
    const ancora = {
      x: ini.x - (sx * ini.w / 2) * cos + (sy * ini.h / 2) * sin,
      y: ini.y - (sx * ini.w / 2) * sin - (sy * ini.h / 2) * cos,
    };
    const base = excessoTexto();
    let valido = { x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rot };

    const mover = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      const p = paraPalco(ev);
      let tentativas;
      if (tipo === 'mover') {
        const [nx, ny] = centroValido(ini.x + p.x - p0.x, ini.y + p.y - p0.y);
        tentativas = [{ x: nx, y: ny }, { x: nx, y: s.y }, { x: s.x, y: ny }];
      } else if (tipo === 'girar') {
        let graus = (Math.atan2(p.y - ini.y, p.x - ini.x) * 180) / Math.PI + 90;
        if (ev.shiftKey) graus = Math.round(graus / 15) * 15;
        tentativas = [{ rot: normalizarGraus(graus) }];
      } else {
        const vx = p.x - ancora.x;
        const vy = p.y - ancora.y;
        const lx = vx * cos + vy * sin;
        const ly = -vx * sin + vy * cos;
        let k = (lx * sx * ini.w + ly * sy * ini.h) / (ini.w * ini.w + ini.h * ini.h);
        const menor = Math.min(ini.w, ini.h);
        const maior = Math.max(ini.w, ini.h);
        k = limitar(k, LADO_MIN / menor, LADO_MAX / maior);
        const w = ini.w * k;
        const h = ini.h * k;
        const ax = (sx * w) / 2;
        const ay = (sy * h) / 2;
        tentativas = [{ w, h, x: ancora.x + ax * cos - ay * sin, y: ancora.y + ax * sin + ay * cos }];
      }
      const aplicada = tentativas.findIndex((t) => aplicarSePossivel(s, t, base));
      if (aplicada >= 0) valido = { x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rot };
      if (aplicada !== 0) avisarFolha(AVISO_SEM_ESPACO, 1500);
      atualizarEl(s);
      atualizarSel();
    };

    const fim = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', fim);
      window.removeEventListener('pointercancel', fim);
      Object.assign(s, limparAdesivo(s));
      atualizarColisao();
      if (excessoTexto() > base) Object.assign(s, limparAdesivo({ ...s, ...valido }));
      if (tipo === 'mover') reatribuirPagina(s);
      if (fotoAd() !== antes) guardarAd(antes);
      desenharAdesivos();
    };

    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', fim);
    window.addEventListener('pointercancel', fim);
  }

  // touch-action: none garante que o toque nas alças (inclusive as de corte) não vire rolagem/zoom
  selAd.style.touchAction = 'none';
  camadaAd.style.touchAction = 'none';
  selAd.querySelectorAll('[data-gesto]').forEach((alca) => {
    alca.style.touchAction = 'none';
    alca.addEventListener('pointerdown', (e) => comecarGesto(e, alca.dataset.gesto, alca));
  });

  function removerAd(id) {
    mutarAd(() => {
      for (const f of folhas) {
        const i = f.adesivos.findIndex((a) => a.id === id);
        if (i >= 0) {
          f.adesivos.splice(i, 1);
          break;
        }
      }
    });
    if (selecionadoAd === id) selecionadoAd = null;
    desenharAdesivos();
  }

  function acaoAdesivo(acao) {
    const achado = achar(selecionadoAd);
    if (!achado) return;
    const { s, folha } = achado;
    const lista = folha.adesivos;
    if (acao === 'espelhar') {
      mutarAd(() => { s.espelho = !s.espelho; });
    } else if (acao === 'duplicar') {
      if (lista.length >= LIMITE_AD) {
        avisarFolha(`limite de ${LIMITE_AD} adesivos por folha.`, 3000);
        return;
      }
      const copia = limparAdesivo({ ...s, id: novoId() });
      let coube = false;
      mutarAd(() => { coube = posicionarNovo(folha, copia, s.x + 24, s.y + 24); });
      if (!coube) {
        avisarFolha('não há espaço livre nessa folha para duplicar.', 3000);
        return;
      }
      selecionadoAd = copia.id;
    } else if (acao === 'cortar') {
      cortando = cortando === s.id ? null : s.id;
    } else if (acao === 'frente') {
      mutarAd(() => { lista.push(...lista.splice(lista.indexOf(s), 1)); });
    } else if (acao === 'tras') {
      mutarAd(() => { lista.unshift(...lista.splice(lista.indexOf(s), 1)); });
    }
    desenharAdesivos();
  }

  barAd.addEventListener('pointerdown', (e) => {
    if (e.target !== sliderOpac) e.preventDefault();
  });
  barAd.querySelectorAll('[data-acao]').forEach((b) =>
    b.addEventListener('click', () => acaoAdesivo(b.dataset.acao)));

  let opacidadeAntes = null;
  sliderOpac.addEventListener('input', () => {
    const achado = achar(selecionadoAd);
    if (!achado) return;
    if (opacidadeAntes === null) opacidadeAntes = fotoAd();
    achado.s.opacidade = Math.round(limitar(Number(sliderOpac.value), 0, 100));
    valorOpac.textContent = `${achado.s.opacidade}%`;
    atualizarEl(achado.s);
  });
  sliderOpac.addEventListener('change', () => {
    if (opacidadeAntes !== null && fotoAd() !== opacidadeAntes) guardarAd(opacidadeAntes);
    opacidadeAntes = null;
  });

  let rolagemAntes = null;
  let temporizadorRolagem = null;
  camadaAd.addEventListener('wheel', (e) => {
    if (!editandoAd || apagandoAd) return;
    const alvo = e.target.closest('.adesivo');
    if (!alvo) return;
    const achado = achar(alvo.dataset.id);
    if (!achado) return;
    e.preventDefault();
    if (selecionadoAd !== achado.s.id) selecionarAd(achado.s.id);
    if (rolagemAntes === null) rolagemAntes = fotoAd();
    const s = achado.s;
    const delta = e.deltaY || e.deltaX;
    let novo;
    if (e.shiftKey) {
      novo = { rot: normalizarGraus(s.rot - Math.sign(delta) * 5) };
    } else {
      const k = limitar(Math.exp(-delta * 0.0015), LADO_MIN / Math.min(s.w, s.h), LADO_MAX / Math.max(s.w, s.h));
      novo = { w: s.w * k, h: s.h * k };
    }
    if (!aplicarSePossivel(s, novo, excessoTexto())) avisarFolha(AVISO_SEM_ESPACO, 1500);
    Object.assign(s, limparAdesivo(s));
    atualizarColisao();
    atualizarEl(s);
    atualizarSel();
    clearTimeout(temporizadorRolagem);
    temporizadorRolagem = setTimeout(() => {
      if (rolagemAntes !== null && fotoAd() !== rolagemAntes) guardarAd(rolagemAntes);
      rolagemAntes = null;
    }, 400);
  }, { passive: false });

  $('btnAdesivos').addEventListener('click', () => {
    popRecentes.hidden = true;
    arqAd.value = '';
    arqAd.click();
  });

  arqAd.addEventListener('change', () => {
    const arquivos = Array.from(arqAd.files || []);
    arqAd.value = '';
    if (arquivos.length) adicionarArquivos(arquivos);
  });

  arqAd.addEventListener('cancel', () => {
    if (!editandoAd && temAdesivosVisiveis()) entrarEdicaoAd();
  });

  $('btnApagar').addEventListener('click', () => {
    if (!editandoAd) {
      if (!temAdesivosVisiveis()) {
        avisarFolha('não há adesivos nesta folha.', 2500);
        return;
      }
      entrarEdicaoAd();
    }
    if (selecionadoAd) {
      removerAd(selecionadoAd);
      return;
    }
    apagandoAd = !apagandoAd;
    camadaAd.classList.toggle('apagando', apagandoAd);
    atualizarSel();
    if (apagandoAd) avisarFolha('clique no adesivo que deseja apagar.', 2500);
  });

  okAd.addEventListener('click', confirmarAdesivos);

  $('cena').addEventListener('pointerdown', (e) => {
    if (!editandoAd || !selecionadoAd) return;
    if (e.target.closest('.adesivo, .adsel, .adbar, #btnApagar, #btnAdesivos, #btnOkAdesivos')) return;
    selecionadoAd = null;
    atualizarSel();
  });

  document.addEventListener('keydown', (e) => {
    if (!editandoAd) return;
    if (e.ctrlKey || e.metaKey) {
      if (e.altKey) return;
      const tecla = e.key.toLowerCase();
      if (tecla === 'z' && !e.shiftKey) {
        e.preventDefault();
        desfazerAd();
      } else if (tecla === 'y' || (tecla === 'z' && e.shiftKey)) {
        e.preventDefault();
        refazerAd();
      }
      return;
    }
    if (e.key === 'Escape') {
      selecionadoAd = null;
      apagandoAd = false;
      camadaAd.classList.remove('apagando');
      atualizarSel();
      return;
    }
    const achado = achar(selecionadoAd);
    if (!achado || apagandoAd) return;
    if (e.target === sliderOpac && e.key.startsWith('Arrow')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removerAd(achado.s.id);
      return;
    }
    const passo = e.shiftKey ? 10 : 1;
    const dir = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[e.key];
    if (dir) {
      e.preventDefault();
      mutarAd(() => {
        const [nx, ny] = centroValido(achado.s.x + dir[0], achado.s.y + dir[1]);
        if (aplicarSePossivel(achado.s, { x: nx, y: ny }, excessoTexto())) reatribuirPagina(achado.s);
        else avisarFolha(AVISO_SEM_ESPACO, 1500);
      });
      desenharAdesivos();
    }
  });

  [taEsq, taDir].forEach((t) => t.addEventListener('focusin', () => { ultimoFoco = t; }));

  carregar();
})();
