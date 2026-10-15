// Gera o hash bcrypt da senha do site.
// Uso:  npm run hash-senha
const readline = require('readline');
const bcrypt = require('bcryptjs');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Digite a senha do site (ela aparece na tela enquanto você digita): ', async (senha) => {
  rl.close();
  if (!senha || senha.length < 8) {
    console.error('\nUse uma senha com pelo menos 8 caracteres.');
    process.exit(1);
  }
  const hash = await bcrypt.hash(senha, 12);
  console.log('\nCole esta linha no seu .env (e nas variáveis da Vercel):\n');
  console.log(`SITE_PASSWORD_HASH='${hash}'`);
  console.log('\n(Guarde a senha em um lugar seguro: só o hash fica salvo no servidor.)');
});
