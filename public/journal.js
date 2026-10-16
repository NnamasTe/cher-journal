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

  function montarFolha(pagina) {
    const texto = String(pagina[CAMPO_TEXTO] || '');
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
    taEsq.value = fe ? fe.texto : '';
    taDir.value = fd ? fd.texto : '';
    taEsq.readOnly = !fe;
    taDir.readOnly = !fd;
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

  function registrar(indice, antes, depois) {
    const agora = Date.now();
    const ultimo = desfazer[desfazer.length - 1];
    if (ultimo && ultimo.indice === indice && agora - ultimo.t < 700 &&
        Math.abs(depois.length - ultimo.antes.length) < 60) {
      ultimo.depois = depois;
      ultimo.t = agora;
    } else {
      desfazer.push({ indice, antes, depois, t: agora });
      if (desfazer.length > 300) desfazer.shift();
    }
    refazer.length = 0;
  }

  function aoEscrever(ta, indice) {
    const folha = folhas[indice];
    if (!folha || ta.value === folha.texto) return;

    if (ta.scrollHeight > ta.clientHeight + 1) {
      const posicao = ta.selectionStart - (ta.value.length - folha.texto.length);
      ta.value = folha.texto;
      const p = Math.max(0, Math.min(posicao, ta.value.length));
      ta.setSelectionRange(p, p);
      avisarFolha('a folha está cheia.');
      return;
    }

    registrar(indice, folha.texto, ta.value);
    folha.texto = ta.value;
  }

  function ligarEscrita(ta, deslocamento) {
    ta.addEventListener('input', (e) => {
      if (!e.isComposing) aoEscrever(ta, esq - 1 + deslocamento);
    });
    ta.addEventListener('compositionend', () => aoEscrever(ta, esq - 1 + deslocamento));
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
    ta.setSelectionRange(ta.value.length, ta.value.length);
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

  anotTexto.addEventListener('input', salvarAnotacoes); // salva automaticamente
  $('btnAnotacoes').addEventListener('click', abrirAnotacoes);
  $('btnCopiar').addEventListener('click', copiarAnotacoes);
  $('btnOk').addEventListener('click', fecharAnotacoes);

  carregar();
})();
