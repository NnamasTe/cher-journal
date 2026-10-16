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

      const base = paginas[0] ? paginas[0].data : journal.data_Criacao;
      $('numEsq').textContent = '1';
      $('numDir').textContent = '2';
      $('dataFolha').textContent = formatoData.format(new Date(base));
    } catch (_) {
    }
  }

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

  carregar();
})();
