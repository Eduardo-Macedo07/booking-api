import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addMinutes,
  bearer,
  createResource,
  createTestApp,
  futureDate,
  registerAdmin,
  registerUser,
  resetDatabase,
  type TestContext,
} from './helpers.js';

describe('Observabilidade e operação (e2e)', () => {
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

  it('health: liveness e readiness (com banco) respondem 200 sem autenticação', async () => {
    await ctx.http().get('/health/live').expect(200);
    const ready = await ctx.http().get('/health/ready').expect(200);
    expect(ready.body.status).toBe('ok');
    expect(ready.body.details.database.status).toBe('up');
  });

  it('devolve X-Request-Id gerado, ou reaproveita o que o proxy enviou', async () => {
    const generated = await ctx.http().get('/health/live').expect(200);
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const echoed = await ctx.http().get('/health/live').set('X-Request-Id', 'abc-123').expect(200);
    expect(echoed.headers['x-request-id']).toBe('abc-123');
  });

  it('o erro devolvido carrega o requestId para facilitar o suporte', async () => {
    const res = await ctx.http().get('/resources').set('X-Request-Id', 'req-42').expect(401);
    expect(res.body.requestId).toBe('req-42');
  });

  it('/metrics expõe métricas HTTP e de negócio no formato Prometheus', async () => {
    const admin = await registerAdmin(ctx);
    const ana = await registerUser(ctx);
    const room = await createResource(ctx, admin, 'Sala A');
    const start = futureDate(2, 14, 0);
    const send = (user: typeof ana) =>
      ctx
        .http()
        .post('/bookings')
        .set(bearer(user))
        .send({ resourceId: room.id, startsAt: start, endsAt: addMinutes(start, 60) });
    await send(ana).expect(201);
    await send(await registerUser(ctx)).expect(409);

    const res = await ctx.http().get('/metrics').expect(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toMatch(/bookings_created_total 1\b/);
    expect(res.text).toMatch(/bookings_rejected_total\{reason="resource_overlap"\} 1\b/);
    expect(res.text).toMatch(
      /http_request_duration_seconds_count\{method="POST",route="\/bookings",status_code="201"\} 1\b/,
    );
    // o rótulo é a rota, não a URL: ids não explodem a cardinalidade
    await ctx.http().get(`/resources/${room.id}`).set(bearer(ana)).expect(200);
    const after = await ctx.http().get('/metrics').expect(200);
    expect(after.text).toContain('route="/resources/:id"');
    expect(after.text).not.toContain(room.id);
    expect(after.text).toContain('process_cpu_user_seconds_total');
  });

  it('serve a documentação OpenAPI', async () => {
    const doc = await ctx.http().get('/docs-json').expect(200);
    expect(doc.body.info.title).toBe('Booking API');
    expect(Object.keys(doc.body.paths)).toEqual(
      expect.arrayContaining([
        '/auth/login',
        '/bookings',
        '/bookings/{id}/cancel',
        '/resources/{id}/availability',
      ]),
    );
    expect(doc.body.paths['/metrics']).toBeUndefined();
  });

  it('envia cabeçalhos de segurança (helmet)', async () => {
    const res = await ctx.http().get('/health/live').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('rota inexistente devolve 404 no formato padrão', async () => {
    const res = await ctx.http().get('/nao-existe').expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, error: 'Not Found' });
  });
});
