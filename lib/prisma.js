const { PrismaClient } = require('@prisma/client');

const prisma = globalThis.prisma || new PrismaClient({
  log: ['error'],
});

if (process.env.NODE_ENV === 'development') {
  globalThis.prisma = prisma;
}

module.exports = prisma;
