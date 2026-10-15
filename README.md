# Journal do casal

Journal digital privado para duas pessoas. Servidor Express, banco Postgres no Neon (via Prisma), hospedagem na Vercel.

**Como a privacidade funciona:** o site inteiro fica atrás de uma senha única. A API só devolve dados se o navegador tiver o cookie de sessão, que é criado ao acertar a senha e some quando o navegador é fechado. A senha nunca fica salva em texto puro, só o hash (bcrypt).

## Estrutura

```
api/index.js            entrada na Vercel
src/app.js              configura o Express e a barreira de senha
src/auth.js             login, logout e cookie de sessão
src/routes/journals.js  journals e páginas (CRUD)
src/validacao.js        validações dos dados recebidos
prisma/schema.prisma    tabelas Journal e Pagina
prisma/migrations/      criação das tabelas no banco
public/                 telas do site (hoje só uma tela provisória de teste)
scripts/hash-senha.js   gera o hash da senha do site
```

## 1. Criar o banco no Neon

1. Crie um projeto em neon.tech.
2. Em **Connection Details**, copie dois endereços:
   - com **Connection pooling** ligado (o host tem `-pooler`): será o `DATABASE_URL`;
   - com o pooling **desligado**: será o `DIRECT_URL`.

## 2. Rodar no seu computador

Precisa do Node.js 20 ou mais novo.

```bash
npm install
cp .env.example .env      # depois abra o .env e preencha
npm run hash-senha        # gera o SITE_PASSWORD_HASH, cole no .env
npm run db:deploy         # cria as tabelas no Neon
npm run dev               # abre em http://localhost:3000
```

Para o `SESSION_SECRET`, gere um texto aleatório com:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 3. Enviar para o GitHub

```bash
git remote add origin https://github.com/SEU-USUARIO/journal-casal.git
git push -u origin main
```

O arquivo `.env` está no `.gitignore` e **não** sobe. Suas senhas e endereços do banco ficam só com você.

## 4. Publicar na Vercel

1. Na Vercel, **Add New → Project** e importe o repositório do GitHub.
2. Em **Environment Variables**, cadastre as quatro variáveis do `.env`: `DATABASE_URL`, `DIRECT_URL`, `SITE_PASSWORD_HASH` e `SESSION_SECRET`.
3. Clique em **Deploy**. O build já cria as tabelas sozinho (`vercel-build`).

## API (resumo)

Tudo abaixo exige estar logado (senão responde 401).

| Método | Rota | O que faz |
| --- | --- | --- |
| POST | `/api/auth/login` | entra com `{ "senha": "..." }` |
| POST | `/api/auth/logout` | sai |
| GET | `/api/auth/status` | diz se está logado |
| GET | `/api/journals?ordem=recentes\|antigos\|titulo` | lista a estante |
| POST | `/api/journals` | cria journal (`titulo`, `capa` opcional) |
| GET / PATCH / DELETE | `/api/journals/:id` | lê, edita ou exclui um journal |
| GET / POST | `/api/journals/:id/paginas` | lista ou cria páginas |
| GET / PATCH / DELETE | `/api/paginas/:id` | lê, edita ou exclui uma página |

## O que ainda falta

- Upload de imagens (capa e imagens das páginas) com o Vercel Blob.
- As telas do design (estante, página, painéis flutuantes).
- Bloco de rascunhos (fica no navegador de cada pessoa) e a transferência para uma página.
