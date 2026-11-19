import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestContext } from './helpers.js';

describe('Rate limit (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    // O ConfigModule valida o ambiente ao carregar o AppModule, então definimos os limites ANTES do import.
    process.env['AUTH_THROTTLE_LIMIT'] = '3';
    process.env['THROTTLE_LIMIT'] = '100000';
    const helpers = await import('./helpers.js');
    ctx = await helpers.createTestApp();
    await helpers.resetDatabase(ctx.prisma);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('limita tentativas de login (429) sem afetar o restante da API', async () => {
    const attempt = () =>
      ctx.http().post('/auth/login').send({ email: 'ana@example.com', password: 'senha-errada-1' });
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await attempt()).status);

    expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
    expect(statuses.slice(3)).toEqual([429, 429]);

    // /health e /metrics ficam fora do limite
    await ctx.http().get('/health/live').expect(200);
    await ctx.http().get('/metrics').expect(200);
    // e rotas autenticadas fora do grupo "auth" também não são afetadas
    await ctx.http().get('/resources').expect(401);
  });
});
