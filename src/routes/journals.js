const express = require('express');
const prisma = require('../db');
const { textoObrigatorio, urlOuCaminho, corHex, listaDeUrls } = require('../validacao');

const router = express.Router();

const CAPA_PADRAO = '/capa-padrao.png';
const ORDENS = {
  recentes: { data_Criacao: 'desc' },
  antigos: { data_Criacao: 'asc' },
  titulo: { titulo: 'asc' },
};

// Garante que erros de funções async cheguem ao tratador de erros.
const rota = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- JOURNALS ----------

// Lista a estante. Ordem: ?ordem=recentes (padrão) | antigos | titulo
router.get('/journals', rota(async (req, res) => {
  const orderBy = ORDENS[req.query.ordem] || ORDENS.recentes;
  const journals = await prisma.journal.findMany({ orderBy });
  res.json(journals);
}));

router.post('/journals', rota(async (req, res) => {
  const titulo = textoObrigatorio(req.body.titulo, 120);
  if (!titulo) return res.status(400).json({ erro: 'Informe um título de até 120 caracteres.' });

  let capa = CAPA_PADRAO;
  if (req.body.capa !== undefined && req.body.capa !== null) {
    capa = urlOuCaminho(req.body.capa);
    if (!capa) return res.status(400).json({ erro: 'Capa inválida.' });
  }

  const journal = await prisma.journal.create({ data: { titulo, capa } });
  res.status(201).json(journal);
}));

router.get('/journals/:id', rota(async (req, res) => {
  const journal = await prisma.journal.findUnique({ where: { id: req.params.id } });
  if (!journal) return res.status(404).json({ erro: 'Journal não encontrado.' });
  res.json(journal);
}));

router.patch('/journals/:id', rota(async (req, res) => {
  const data = {};

  if (req.body.titulo !== undefined) {
    const titulo = textoObrigatorio(req.body.titulo, 120);
    if (!titulo) return res.status(400).json({ erro: 'Título inválido.' });
    data.titulo = titulo;
  }
  if (req.body.capa !== undefined) {
    // capa: null volta para a imagem padrão
    const capa = req.body.capa === null ? CAPA_PADRAO : urlOuCaminho(req.body.capa);
    if (!capa) return res.status(400).json({ erro: 'Capa inválida.' });
    data.capa = capa;
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ erro: 'Nada para atualizar.' });
  }

  const journal = await prisma.journal.update({ where: { id: req.params.id }, data });
  res.json(journal);
}));

// Excluir o journal exclui também todas as páginas dele.
router.delete('/journals/:id', rota(async (req, res) => {
  await prisma.journal.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

// ---------- PÁGINAS ----------

router.get('/journals/:id/paginas', rota(async (req, res) => {
  const journal = await prisma.journal.findUnique({ where: { id: req.params.id } });
  if (!journal) return res.status(404).json({ erro: 'Journal não encontrado.' });

  const paginas = await prisma.pagina.findMany({
    where: { journalId: req.params.id },
    orderBy: [{ data: 'asc' }, { id: 'asc' }],
  });
  res.json(paginas);
}));

// Valida os campos de uma página. Em criação (parcial = false) tudo é opcional e
// recebe valor padrão; na edição (parcial = true) só entra o que foi enviado.
function lerCamposDaPagina(body, parcial) {
  const data = {};

  if (body.anotacoes !== undefined) {
    if (typeof body.anotacoes !== 'string' || body.anotacoes.length > 50000) {
      return { erro: 'Anotações inválidas (máximo de 50.000 caracteres).' };
    }
    data.anotacoes = body.anotacoes;
  }
  if (body.textura_Pag !== undefined) {
    const t = textoObrigatorio(body.textura_Pag, 50);
    if (!t) return { erro: 'Textura inválida.' };
    data.textura_Pag = t;
  }
  if (body.cor_Texto !== undefined) {
    const c = corHex(body.cor_Texto);
    if (!c) return { erro: 'Cor do texto inválida. Use o formato #RRGGBB.' };
    data.cor_Texto = c;
  }
  if (body.imagens !== undefined) {
    const lista = listaDeUrls(body.imagens);
    if (!lista) return { erro: 'Lista de imagens inválida (até 20 endereços https).' };
    data.imagens = lista;
  }

  if (parcial && Object.keys(data).length === 0) return { erro: 'Nada para atualizar.' };
  return { data };
}

// "Salvar página": cria a página e soma 1 no contador do journal, tudo junto.
router.post('/journals/:id/paginas', rota(async (req, res) => {
  const { data, erro } = lerCamposDaPagina(req.body, false);
  if (erro) return res.status(400).json({ erro });

  const pagina = await prisma.$transaction(async (tx) => {
    await tx.journal.update({
      where: { id: req.params.id },
      data: { qttd_Paginas: { increment: 1 } },
    });
    return tx.pagina.create({ data: { ...data, journalId: req.params.id } });
  });
  res.status(201).json(pagina);
}));

router.get('/paginas/:id', rota(async (req, res) => {
  const pagina = await prisma.pagina.findUnique({ where: { id: req.params.id } });
  if (!pagina) return res.status(404).json({ erro: 'Página não encontrada.' });
  res.json(pagina);
}));

// "Salvar página" numa página que já existe. A data de criação não muda.
router.patch('/paginas/:id', rota(async (req, res) => {
  const { data, erro } = lerCamposDaPagina(req.body, true);
  if (erro) return res.status(400).json({ erro });

  const pagina = await prisma.pagina.update({ where: { id: req.params.id }, data });
  res.json(pagina);
}));

router.delete('/paginas/:id', rota(async (req, res) => {
  await prisma.$transaction(async (tx) => {
    const apagada = await tx.pagina.delete({ where: { id: req.params.id } });
    await tx.journal.update({
      where: { id: apagada.journalId },
      data: { qttd_Paginas: { decrement: 1 } },
    });
  });
  res.json({ ok: true });
}));

module.exports = router;
