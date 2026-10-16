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

  carregar();
})();
