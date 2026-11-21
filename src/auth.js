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

function dataHoraBR(data = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(data).map((x) => [x.type, x.value]),
  );
  return `${partes.day}/${partes.month}/${partes.year}, às ${partes.hour}h${partes.minute}min${partes.second}s`;
}

function montarEmailAlerta({ porIp, ip, navegador, link }) {
  const motivo = porIp
    ? '✦ Cher Journal - limite de tentativas excedido (IP)'
    : 'limite global de tentativas excedido (vários endereços).';
  const quando = dataHoraBR();

  const texto = [
    'oiiiii',
    'parece que alguém andou tentando adivinhar a senha do cher-journal!!!',
    '',
    'BLOQUEIO DE SEGURANÇA',
    'um acesso ao login foi temporariamente bloqueado por excesso de tentativas!',
    `motivo: ${motivo}`,
    'Relatório da ocorrência:',
    '',
    `* IP do suspeito: ${ip}`,
    `* Navegador: ${navegador}`,
    `* Data e horário: ${quando}`,
    '',
    'Foi você quem errou a senha?',
    link
      ? `♡ Limpar meu bloqueio de acesso: ${link}\neste link é válido por apenas 1 hora após o envio. não compartilhe com ninguém!`
      : 'Se foi você, é só esperar 15 minutos e tentar de novo.',
    '',
    'não foi você?',
    'nesse caso, ignore o link acima e considere alterar a senha do site. É melhor prevenir do que deixar um visitante indesejado passear pelo nosso diário!',
    '',
    '✦ Cher Journal',
    '♡',
  ].join('\n');

  const pequeno = 'font-size:12px;color:#8a7a80;margin:6px 0 0';
  const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#3b2f34;line-height:1.5">`
    + `<p style="font-size:18px;margin:0 0 4px">oiiiii</p>`
    + `<p style="margin:0 0 20px">parece que alguém andou tentando adivinhar a senha do <b>cher-journal</b>!!!</p>`
    + `<h2 style="font-size:15px;letter-spacing:.08em;margin:0 0 6px;color:#b4506b">BLOQUEIO DE SEGURANÇA</h2>`
    + `<p style="margin:0 0 6px">Um acesso ao login foi temporariamente bloqueado por excesso de tentativas!</p>`
    + `<p style="margin:0 0 14px"><b>Motivo:</b> ${esc(motivo)}</p>`
    + `<p style="margin:0 0 4px"><b>Relatório da ocorrência:</b></p>`
    + `<ul style="margin:0 0 20px;padding-left:20px">`
    + `<li>IP do suspeito: <code>${esc(ip)}</code></li>`
    + `<li>Navegador: ${esc(navegador)}</li>`
    + `<li>Data e horário: ${esc(quando)}</li>`
    + `</ul>`
    + `<p style="margin:0 0 10px"><b>Foi você quem errou a senha?</b></p>`
    + (link
      ? `<p style="margin:0"><a href="${esc(link)}" style="display:inline-block;padding:10px 18px;background:#e58aa5;color:#fff;border-radius:999px;text-decoration:none;font-weight:600">♡ Limpar meu bloqueio de acesso</a></p>`
        + `<p style="${pequeno}">este link é válido por apenas 1 hora após o envio. não compartilhe com ninguém!</p>`
      : `<p style="margin:0">Se foi você, é só esperar 15 minutos e tentar de novo.</p>`)
    + `<p style="margin:24px 0 4px"><b>não foi você?</b></p>`
    + `<p style="margin:0">nesse caso, ignore o link acima e considere alterar a senha do site. É melhor prevenir do que deixar um visitante indesejado passear pelo nosso diário!</p>`
    + `<p style="${pequeno};margin-top:24px">✦ Cher Journal</p>`
    + `<p style="margin:2px 0 0;color:#e58aa5">♡</p>`
    + `</div>`;

  return { texto, html };
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
    'Limpar bloqueio de login',
    '<p>Isto apaga o contador de tentativas de login.</p>'
      + `<form method="post" action="/api/auth/desbloquear?t=${encodeURIComponent(token)}">`
      + '<button type="submit">Limpar bloqueio</button></form>',
  ));
}

async function desbloquear(req, res) {
  if (!tokenDeDesbloqueioValido(req.query.t)) return res.status(400).type('html').send(LINK_INVALIDO);
  await prisma.tentativaLogin.deleteMany({});
  return res.type('html').send(paginaHtml('Pronto', '<p>Bloqueio limpo. Você já pode entrar no site.</p>'));
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
    const marca = `alerta:${doIp > MAX_POR_IP ? chave : 'global'}`;
    const jaAvisou = await prisma.tentativaLogin.count({
      where: { chave: marca, criadoEm: { gte: desde } },
    });
    if (!jaAvisou) {
      await prisma.tentativaLogin.create({ data: { chave: marca } });

      const { texto, html } = montarEmailAlerta({
        porIp: doIp > MAX_POR_IP,
        ip: ipDoCliente(req),
        navegador: String(req.headers['user-agent'] || 'desconhecido').slice(0, 200),
        link: linkDeDesbloqueio(),
      });
      await enviarAlerta('✦ Cher Journal - limite de tentativas excedido (IP)', texto, html);
    }
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

const comErro = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = {
  login: comErro(login),
  logout,
  status,
  exigirSenhaDoSite,
  paginaDesbloqueio,
  desbloquear: comErro(desbloquear),
};