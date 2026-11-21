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

const VALIDADE_DESBLOQUEIO = '1h';

function ipDoCliente(req) {
  const bruto = req.headers['x-vercel-forwarded-for']
    || req.headers['x-forwarded-for']
    || req.socket.remoteAddress
    || 'desconhecido';
  return String(bruto).split(',')[0].trim();
}

function chaveDoCliente(req) {
  return crypto.createHash('sha256').update(ipDoCliente(req)).digest('hex');
}

function esc(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function enviarAlerta(assunto, texto, html) {
  const chaveApi = process.env.RESEND_API_KEY;
  const para = process.env.ALERTA_EMAIL;
  if (!chaveApi || !para) return;
  try {
    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chaveApi}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'cher journal <onboarding@resend.dev>',
        to: [para],
        subject: assunto,
        text: texto,
        html,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!resposta.ok) console.error('alerta: o Resend respondeu', resposta.status);
  } catch (erro) {
    console.error('alerta: falha ao enviar e-mail', erro.message);
  }
}

function linkDeDesbloqueio() {
  const base = process.env.SITE_URL;
  const segredo = process.env.SESSION_SECRET;
  if (!base || !segredo) return null;
  const token = jwt.sign({ acao: 'desbloquear' }, segredo, { expiresIn: VALIDADE_DESBLOQUEIO });
  return `${base.replace(/\/+$/, '')}/api/auth/desbloquear?t=${encodeURIComponent(token)}`;
}

function tokenDeDesbloqueioValido(token) {
  const segredo = process.env.SESSION_SECRET;
  if (!segredo || typeof token !== 'string') return false;
  try {
    const dados = jwt.verify(token, segredo);
    return dados && dados.acao === 'desbloquear';
  } catch {
    return false;
  }
}

function paginaHtml(titulo, corpo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<meta name="robots" content="noindex, nofollow"><title>${titulo}</title>`
    + `<style>body{font-family:system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 16px;text-align:center}`
    + `button{font-size:1rem;padding:.7rem 1.2rem;cursor:pointer}</style></head>`
    + `<body><h1>${titulo}</h1>${corpo}</body></html>`;
}

const LINK_INVALIDO = paginaHtml(
  'Link inválido ou expirado',
  '<p>Espere 15 minutos ou limpe o bloqueio pelo terminal.</p>',
);

function paginaDesbloqueio(req, res) {
  const token = req.query.t;
  if (!tokenDeDesbloqueioValido(token)) return res.status(400).type('html').send(LINK_INVALIDO);
  return res.type('html').send(paginaHtml(
    'limpar bloqueio de login',
    '<p>isto apaga o contador de tentativas de login:</p>'
      + `<form method="post" action="/api/auth/desbloquear?t=${encodeURIComponent(token)}">`
      + '<button type="submit">Limpar bloqueio</button></form>',
  ));
}

async function desbloquear(req, res) {
  if (!tokenDeDesbloqueioValido(req.query.t)) return res.status(400).type('html').send(LINK_INVALIDO);
  await prisma.tentativaLogin.deleteMany({});
  return res.type('html').send(paginaHtml('prontinho!', '<p>bloqueio limpo. você já pode entrar no site.</p>'));
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
    return res.status(500).json({ erro: 'o servidor ainda não foi configurado com a senha do site.' });
  }

  const chave = chaveDoCliente(req);
  await prisma.tentativaLogin.create({ data: { chave } });
  const desde = new Date(Date.now() - JANELA_MS);
  const [doIp, total] = await Promise.all([
    prisma.tentativaLogin.count({ where: { chave, criadoEm: { gte: desde } } }),
    prisma.tentativaLogin.count({ where: { criadoEm: { gte: desde } } }),
  ]);
  if (doIp > MAX_POR_IP || total > MAX_GLOBAL) {
    const marca = `alerta:${doIp > MAX_POR_IP ? chave : 'global'}`;
    const jaAvisou = await prisma.tentativaLogin.count({
      where: { chave: marca, criadoEm: { gte: desde } },
    });
    if (!jaAvisou) {
      await prisma.tentativaLogin.create({ data: { chave: marca } });

      const linhas = [
        'um acesso ao login foi bloqueado por excesso de tentativas!!',
        `motivo: ${doIp > MAX_POR_IP ? 'limite por IP' : 'limite global'}`,
        `IP: ${ipDoCliente(req)}`,
        `navegador: ${String(req.headers['user-agent'] || 'desconhecido').slice(0, 120)}`,
        `horário: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
      ];
      const link = linkDeDesbloqueio();
      const texto = [
        ...linhas,
        '',
        link
          ? `se foi só você errando a senha, limpe o bloqueio por este link (vale 1 hora, não repasse):\n${link}`
          : 'se foi você errando a senha, pode ignorar. se não foi, considere trocar a senha do site!!!',
      ].join('\n');
      const html = `<p>${linhas.map(esc).join('<br>')}</p>`
        + (link
          ? `<p><a href="${esc(link)}" style="display:inline-block;padding:10px 16px;background:#222;color:#fff;border-radius:6px;text-decoration:none">Fui eu errando a senha: limpar bloqueio</a></p>`
            + '<p>o link vale por 1 hora. não o encaminhe a ninguém. se não foi você, ignore o botão e considere trocar a senha do site!!!</p>'
          : '<p>se não foi você, considere trocar a senha do site!!!</p>');

      await enviarAlerta('cher journal: tentativas de login suspeitas', texto, html);
    }
    res.set('Retry-After', String(JANELA_MS / 1000));
    return res.status(429).json({ erro: 'muitas tentativas. tente de novo em alguns minutos.' });
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

const comErro = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = {
  login: comErro(login),
  logout,
  status,
  exigirSenhaDoSite,
  paginaDesbloqueio,
  desbloquear: comErro(desbloquear),
};