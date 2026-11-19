import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bearer, createTestApp, registerUser, resetDatabase, type TestContext } from './helpers.js';

describe('Auth (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
  });

  describe('POST /auth/register', () => {
    it('cria a conta, normaliza o e-mail e devolve tokens', async () => {
      const res = await ctx
        .http()
        .post('/auth/register')
        .send({ email: '  Ana@Example.COM ', name: ' Ana ', password: 'senha-forte-123' })
        .expect(201);

      expect(res.body).toMatchObject({
        tokenType: 'Bearer',
        expiresIn: 900,
        user: { email: 'ana@example.com', name: 'Ana', role: 'USER' },
      });
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toEqual(expect.any(String));
      expect(res.body.user).not.toHaveProperty('passwordHash');
    });

    it('não guarda a senha em texto puro', async () => {
      await registerUser(ctx, { email: 'ana@example.com' });
      const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'ana@example.com' } });
      expect(stored.passwordHash).not.toContain('senha-forte-123');
      expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
    });

    it('recusa e-mail repetido (409), mesmo com outra caixa', async () => {
      await registerUser(ctx, { email: 'ana@example.com' });
      const res = await ctx
        .http()
        .post('/auth/register')
        .send({ email: 'ANA@example.com', name: 'Outra Ana', password: 'senha-forte-123' })
        .expect(409);
      expect(res.body.message).toBe('Email already registered');
    });

    it('valida os campos e recusa campos desconhecidos (não dá para se auto-promover a ADMIN)', async () => {
      const res = await ctx
        .http()
        .post('/auth/register')
        .send({ email: 'ana@example.com', name: 'Ana', password: 'curta', role: 'ADMIN' })
        .expect(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          'property role should not exist',
          'password must be longer than or equal to 8 characters',
        ]),
      );
    });
  });

  describe('POST /auth/login', () => {
    it('autentica com as credenciais corretas', async () => {
      await registerUser(ctx, { email: 'ana@example.com' });
      const res = await ctx
        .http()
        .post('/auth/login')
        .send({ email: 'ANA@example.com', password: 'senha-forte-123' })
        .expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it('responde igual para senha errada e para e-mail inexistente', async () => {
      await registerUser(ctx, { email: 'ana@example.com' });
      const wrongPassword = await ctx
        .http()
        .post('/auth/login')
        .send({ email: 'ana@example.com', password: 'senha-errada-1' })
        .expect(401);
      const unknownEmail = await ctx
        .http()
        .post('/auth/login')
        .send({ email: 'ninguem@example.com', password: 'senha-errada-1' })
        .expect(401);
      expect(wrongPassword.body.message).toBe('Invalid credentials');
      expect(unknownEmail.body.message).toBe('Invalid credentials');
    });
  });

  describe('proteção das rotas', () => {
    it('exige token', async () => {
      await ctx.http().get('/auth/me').expect(401);
      await ctx.http().get('/resources').expect(401);
      await ctx.http().get('/bookings').expect(401);
    });

    it('recusa token inválido', async () => {
      const res = await ctx
        .http()
        .get('/auth/me')
        .set('Authorization', 'Bearer isso-nao-e-um-jwt')
        .expect(401);
      expect(res.body.message).toBe('Invalid or expired token');
    });

    it('GET /auth/me devolve o usuário do token', async () => {
      const user = await registerUser(ctx, { email: 'ana@example.com' });
      const res = await ctx.http().get('/auth/me').set(bearer(user)).expect(200);
      expect(res.body).toEqual({ id: user.id, email: 'ana@example.com', name: 'Test User', role: 'USER' });
    });
  });

  describe('refresh token', () => {
    it('troca o token por um novo par e invalida o anterior (rotação)', async () => {
      const user = await registerUser(ctx);
      const first = await ctx
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(200);

      expect(first.body.refreshToken).not.toBe(user.refreshToken);
      await ctx.http().get('/auth/me').set('Authorization', `Bearer ${first.body.accessToken}`).expect(200);
    });

    it('detecta reuso de um token já trocado e revoga a sessão inteira', async () => {
      const user = await registerUser(ctx);
      const rotated = await ctx
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(200);

      // Alguém (atacante ou cliente bugado) reapresenta o token antigo...
      const reuse = await ctx
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(401);
      expect(reuse.body.message).toBe('Refresh token reuse detected');

      // ...e por segurança o token novo, que era legítimo, também deixa de funcionar.
      await ctx.http().post('/auth/refresh').send({ refreshToken: rotated.body.refreshToken }).expect(401);
    });

    it('recusa token desconhecido', async () => {
      await ctx.http().post('/auth/refresh').send({ refreshToken: 'nao-existe' }).expect(401);
    });

    it('recusa token expirado', async () => {
      const user = await registerUser(ctx);
      await ctx.prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      const res = await ctx
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(401);
      expect(res.body.message).toBe('Refresh token expired');
    });

    it('duas renovações simultâneas com o mesmo token: no máximo uma vence', async () => {
      const user = await registerUser(ctx);
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          ctx.http().post('/auth/refresh').send({ refreshToken: user.refreshToken }),
        ),
      );
      expect(results.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
      expect(results.every((r) => r.status === 200 || r.status === 401)).toBe(true);
    });
  });

  describe('POST /auth/logout', () => {
    it('revoga o refresh token (204) e é idempotente', async () => {
      const user = await registerUser(ctx);
      await ctx.http().post('/auth/logout').send({ refreshToken: user.refreshToken }).expect(204);
      await ctx.http().post('/auth/refresh').send({ refreshToken: user.refreshToken }).expect(401);
      await ctx.http().post('/auth/logout').send({ refreshToken: user.refreshToken }).expect(204);
      await ctx.http().post('/auth/logout').send({ refreshToken: 'desconhecido' }).expect(204);
    });
  });
});
