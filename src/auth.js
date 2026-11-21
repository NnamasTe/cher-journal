const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('./db');

const COOKIE = 'sessao';
const emProducao = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';


const DURACAO_SESSAO_DIAS = 30;
const DURACAO_SESSAO_MS = DURACAO_SESSAO_DIAS * 24 * 60 * 60 * 1000;

const JANELA_MS = 15 * 60 * 1000;
const MAX_POR_IP = 5;
const MAX_GLOBAL = 50;

function chaveDoCliente(req) {
  const bruto = req.headers['x-vercel-forwarded-for']
    || req.headers['x-forwarded-for']
    || req.socket.remoteAddress
    || 'desconhecido';
  const ip = String(bruto).split(',')[0].trim();
  return crypto.createHash('sha256').update(ip).digest('hex');
}

function opcoesCookie() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: emProducao,
    path: '/',
  };
}

async function login(req, res) {
  const senha = req.body && req.body.senha;
  if (typeof senha !== 'string' || senha.length === 0 || senha.length > 200) {
    return res.status(400).json({ erro: 'Informe a senha.' });
  }

  const hash = process.env.SITE_PASSWORD_HASH;
  const segredo = process.env.SESSION_SECRET;
  if (!hash || !segredo) {
    return res.status(500).json({ erro: 'O servidor ainda não foi configurado com a senha do site.' });
  }

  const chave = chaveDoCliente(req);
  await prisma.tentativaLogin.create({ data: { chave } });
  const desde = new Date(Date.now() - JANELA_MS);
  const [doIp, total] = await Promise.all([
    prisma.tentativaLogin.count({ where: { chave, criadoEm: { gte: desde } } }),
    prisma.tentativaLogin.count({ where: { criadoEm: { gte: desde } } }),
  ]);
  if (doIp > MAX_POR_IP || total > MAX_GLOBAL) {
    res.set('Retry-After', String(JANELA_MS / 1000));
    return res.status(429).json({ erro: 'Muitas tentativas. Tente de novo em alguns minutos.' });
  }

  const correta = await bcrypt.compare(senha, hash);
  if (!correta) {
    return res.status(401).json({ erro: 'Senha incorreta.' });
  }

  await prisma.tentativaLogin.deleteMany({
    where: { OR: [{ chave }, { criadoEm: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }] },
  });

  const token = jwt.sign({ acesso: true }, segredo, { expiresIn: `${DURACAO_SESSAO_DIAS}d` });
  res.cookie(COOKIE, token, { ...opcoesCookie(), maxAge: DURACAO_SESSAO_MS });
  return res.json({ ok: true });
}

function logout(req, res) {
  res.clearCookie(COOKIE, opcoesCookie());
  return res.json({ ok: true });
}

function estaAutenticado(req) {
  const segredo = process.env.SESSION_SECRET;
  const token = req.cookies && req.cookies[COOKIE];
  if (!segredo || !token) return false;
  try {
    const dados = jwt.verify(token, segredo);
    return dados && dados.acesso === true;
  } catch {
    return false;
  }
}

function exigirSenhaDoSite(req, res, next) {
  if (!estaAutenticado(req)) {
    return res.status(401).json({ erro: 'Acesso negado. Entre com a senha do site.' });
  }
  return next();
}

function status(req, res) {
  return res.json({ autenticado: estaAutenticado(req) });
}

module.exports = { login, logout, status, exigirSenhaDoSite };