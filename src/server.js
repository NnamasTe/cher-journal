require('dotenv').config();
const path = require('path');
const express = require('express');
const app = require('./app');

app.use(express.static(path.join(__dirname, '..', 'public')));

const porta = process.env.PORT || 3000;
app.listen(porta, () => {
  console.log(`Journal rodando em http://localhost:${porta}`);
});
