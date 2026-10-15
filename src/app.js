const express = require('express');
const cookieParser = require('cookie-parser');
const auth = require('./auth');
const journalsRouter = require('./routes/journals');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Cabeçalhos básicos de segurança e nada de cache nas respostas da API.
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'same-origin');
  res.set('Cache-Control', 'no-store');
  next();
});

// ----- Rotas abertas (não precisam de senha) -----
app.get('/api/saude', (req, res) => res.json({ ok: true }));
app.post('/api/auth/login', auth.login);
app.post('/api/auth/logout', auth.logout);
app.get('/api/auth/status', auth.status);

// ----- Tudo daqui para baixo exige a senha do site -----
app.use('/api', auth.exigirSenhaDoSite, journalsRouter);

app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// Tratador de erros: nunca devolve detalhes internos para o navegador.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Prisma: registro não encontrado (editar/excluir algo que não existe)
  if (err && err.code === 'P2025') {
    return res.status(404).json({ erro: 'Não encontrado.' });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'JSON inválido.' });
  }
  console.error(err);
  return res.status(500).json({ erro: 'Erro interno do servidor.' });
});

module.exports = app;
