const { PrismaClient } = require('@prisma/client');

const globalParaPrisma = globalThis;
const prisma = globalParaPrisma.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalParaPrisma.__prisma = prisma;

module.exports = prisma;
