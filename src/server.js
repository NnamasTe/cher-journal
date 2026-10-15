// Só para rodar no seu computador. Na Vercel quem inicia o app é o arquivo api/index.js.
require('dotenv').config();
const path = require('path');
const express = require('express');
const app = require('./app');

// Localmente o próprio Express entrega as páginas da pasta public/.
// Na Vercel, a pasta public/ é entregue direto pela plataforma.
app.use(express.static(path.join(__dirname, '..', 'public')));

const porta = process.env.PORT || 3000;
app.listen(porta, () => {
  console.log(`Journal rodando em http://localhost:${porta}`);
});
