const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const COOKIE = 'sessao';
const emProducao = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';

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

  const correta = await bcrypt.compare(senha, hash);
  if (!correta) {
    return res.status(401).json({ erro: 'Senha incorreta.' });
  }

  const token = jwt.sign({ acesso: true }, segredo, { expiresIn: '7d' });
  res.cookie(COOKIE, token, opcoesCookie());
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
