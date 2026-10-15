const express = require('express');
const cookieParser = require('cookie-parser');
const auth = require('./auth');
const journalsRouter = require('./routes/journals');
const uploadsRouter = require('./routes/uploads');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'same-origin');
  res.set('Cache-Control', 'no-store');
  next();
});

app.get('/api/saude', (req, res) => res.json({ ok: true }));
app.post('/api/auth/login', auth.login);
app.post('/api/auth/logout', auth.logout);
app.get('/api/auth/status', auth.status);

app.use('/api', auth.exigirSenhaDoSite, uploadsRouter, journalsRouter);

app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

app.use((err, req, res, next) => {
  if (err && err.code === 'P2025') {
    return res.status(404).json({ erro: 'Não encontrado.' });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'JSON inválido.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ erro: 'Arquivo grande demais.' });
  }
  console.error(err);
  return res.status(500).json({ erro: 'Erro interno do servidor.' });
});

module.exports = app;