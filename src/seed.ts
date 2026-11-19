/**
 * Cria o primeiro administrador (e, opcionalmente, recursos de demonstração).
 *
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='uma-senha-forte' npm run db:seed
 *   SEED_DEMO=true  -> também cria alguns recursos de exemplo
 *
 * É idempotente: pode ser executado várias vezes sem duplicar dados.
 * Em produção roda compilado: `node dist/seed.js`.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { PrismaClient } from './generated/prisma/client.js';

const DEMO_RESOURCES = [
  { name: 'Sala de reunião A', description: 'Projetor e quadro branco', capacity: 8 },
  { name: 'Sala de reunião B', description: 'TV e videoconferência', capacity: 4 },
  { name: 'Auditório', description: 'Palco e sistema de som', capacity: 120 },
  { name: 'Laboratório de informática', description: '30 computadores', capacity: 30 },
];

async function main() {
  const databaseUrl = process.env['DATABASE_URL'];
  const email = process.env['ADMIN_EMAIL']?.trim().toLowerCase();
  const password = process.env['ADMIN_PASSWORD'];
  if (!databaseUrl) throw new Error('DATABASE_URL é obrigatória');
  if (!email || !password) throw new Error('Defina ADMIN_EMAIL e ADMIN_PASSWORD');
  if (password.length < 8) throw new Error('ADMIN_PASSWORD precisa ter ao menos 8 caracteres');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const cost = Number(process.env['BCRYPT_COST'] ?? 12);
    const admin = await prisma.user.upsert({
      where: { email },
      update: { role: 'ADMIN' },
      create: {
        email,
        name: process.env['ADMIN_NAME'] ?? 'Administrador',
        passwordHash: await bcrypt.hash(password, cost),
        role: 'ADMIN',
      },
    });
    console.log(`Administrador pronto: ${admin.email}`);

    if (process.env['SEED_DEMO'] === 'true') {
      for (const resource of DEMO_RESOURCES) {
        await prisma.resource.upsert({ where: { name: resource.name }, update: {}, create: resource });
      }
      console.log(`${DEMO_RESOURCES.length} recursos de demonstração prontos`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

await main();
