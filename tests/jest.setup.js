process.env.NODE_ENV = 'test';
require('dotenv').config({ path: '.env.test' });

const { execSync } = require('node:child_process');

beforeAll(() => {
  execSync('npx prisma migrate reset --force --skip-generate --skip-seed', {
    stdio: 'inherit',
    env: { ...process.env }
  });
});

afterAll(async () => {
  try {
    const prisma = require('../src/config/prisma');
    await prisma.$disconnect();
  } catch (_) {}
});
