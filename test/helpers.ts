import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
}

/** Sobe a aplicação inteira (mesmo pipeline do main.ts) contra o banco de testes. */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app);
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    http: () => request(app.getHttpServer()),
  };
}

export async function resetDatabase(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Booking", "RefreshToken", "Resource", "User" RESTART IDENTITY CASCADE',
  );
}

export interface TestUser {
  id: string;
  email: string;
  token: string;
  refreshToken: string;
}

let counter = 0;

export async function registerUser(
  ctx: TestContext,
  overrides: { email?: string; name?: string } = {},
): Promise<TestUser> {
  const email = overrides.email ?? `user${++counter}-${Date.now()}@example.com`;
  const res = await ctx
    .http()
    .post('/auth/register')
    .send({
      email,
      name: overrides.name ?? 'Test User',
      password: 'senha-forte-123',
    });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    id: res.body.user.id,
    email,
    token: res.body.accessToken,
    refreshToken: res.body.refreshToken,
  };
}

/** Cadastro público só cria USER; para testar rotas de admin, promovemos direto no banco e fazemos login de novo. */
export async function registerAdmin(ctx: TestContext): Promise<TestUser> {
  const user = await registerUser(ctx);
  await ctx.prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  const login = await ctx.http().post('/auth/login').send({ email: user.email, password: 'senha-forte-123' });
  return { ...user, token: login.body.accessToken, refreshToken: login.body.refreshToken };
}

export const bearer = (user: { token: string }) => ({ Authorization: `Bearer ${user.token}` });

export async function createResource(ctx: TestContext, admin: TestUser, name?: string) {
  const res = await ctx
    .http()
    .post('/resources')
    .set(bearer(admin))
    .send({ name: name ?? `Recurso ${++counter}-${Date.now()}`, capacity: 4 });
  if (res.status !== 201) throw new Error(`createResource failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string; name: string };
}

/** Instante no futuro, alinhado a múltiplos de 15 minutos (UTC). */
export function futureDate(daysAhead: number, hour = 14, minute = 0): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  date.setUTCHours(hour, minute, 0, 0);
  return date;
}

export const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);

/** Próximo múltiplo de 15 min, a pelo menos `minutesFromNow` minutos de agora. */
export function soon(minutesFromNow: number): Date {
  const slot = 15 * 60_000;
  return new Date(Math.ceil((Date.now() + minutesFromNow * 60_000) / slot) * slot);
}
