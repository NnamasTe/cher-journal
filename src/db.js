const { PrismaClient } = require('@prisma/client');

// Reaproveita a mesma conexão entre chamadas (importante na Vercel e no modo dev).
const globalParaPrisma = globalThis;
const prisma = globalParaPrisma.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalParaPrisma.__prisma = prisma;

module.exports = prisma;
