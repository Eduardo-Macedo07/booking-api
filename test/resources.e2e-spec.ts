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
  type TestUser,
} from './helpers.js';

describe('Resources (e2e)', () => {
  let ctx: TestContext;
  let admin: TestUser;
  let user: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    admin = await registerAdmin(ctx);
    user = await registerUser(ctx);
  });

  it('admin cria, usuário comum não (403)', async () => {
    const created = await ctx
      .http()
      .post('/resources')
      .set(bearer(admin))
      .send({ name: 'Sala A', description: 'Projetor', capacity: 8 })
      .expect(201);
    expect(created.body).toMatchObject({ name: 'Sala A', capacity: 8, active: true });

    await ctx.http().post('/resources').set(bearer(user)).send({ name: 'Sala B' }).expect(403);
  });

  it('recusa nome repetido (409) e dados inválidos (400)', async () => {
    await createResource(ctx, admin, 'Sala A');
    await ctx.http().post('/resources').set(bearer(admin)).send({ name: 'Sala A' }).expect(409);
    await ctx.http().post('/resources').set(bearer(admin)).send({ name: '', capacity: 0 }).expect(400);
  });

  it('lista com paginação e busca por nome (sem diferenciar maiúsculas)', async () => {
    for (const name of ['Sala A', 'Sala B', 'Sala C', 'Auditório']) await createResource(ctx, admin, name);

    const page1 = await ctx.http().get('/resources?limit=2&page=1').set(bearer(user)).expect(200);
    expect(page1.body.data.map((r: { name: string }) => r.name)).toEqual(['Auditório', 'Sala A']);
    expect(page1.body.meta).toEqual({ page: 1, limit: 2, total: 4, totalPages: 2 });

    const page2 = await ctx.http().get('/resources?limit=2&page=2').set(bearer(user)).expect(200);
    expect(page2.body.data.map((r: { name: string }) => r.name)).toEqual(['Sala B', 'Sala C']);

    const search = await ctx.http().get('/resources?q=SALA').set(bearer(user)).expect(200);
    expect(search.body.meta.total).toBe(3);

    await ctx.http().get('/resources?limit=1000').set(bearer(user)).expect(400);
  });

  it('desativar esconde o recurso dos usuários comuns, mas não do admin', async () => {
    const resource = await createResource(ctx, admin, 'Sala A');
    await ctx.http().delete(`/resources/${resource.id}`).set(bearer(user)).expect(403);
    await ctx.http().delete(`/resources/${resource.id}`).set(bearer(admin)).expect(204);

    await ctx.http().get(`/resources/${resource.id}`).set(bearer(user)).expect(404);
    const asUser = await ctx.http().get('/resources').set(bearer(user)).expect(200);
    expect(asUser.body.meta.total).toBe(0);

    const asAdmin = await ctx.http().get(`/resources/${resource.id}`).set(bearer(admin)).expect(200);
    expect(asAdmin.body.active).toBe(false);
    const inactiveOnly = await ctx.http().get('/resources?active=false').set(bearer(admin)).expect(200);
    expect(inactiveOnly.body.meta.total).toBe(1);
  });

  it('atualiza parcialmente (PATCH) e reativa', async () => {
    const resource = await createResource(ctx, admin, 'Sala A');
    await ctx.http().delete(`/resources/${resource.id}`).set(bearer(admin)).expect(204);
    const res = await ctx
      .http()
      .patch(`/resources/${resource.id}`)
      .set(bearer(admin))
      .send({ capacity: 20, active: true })
      .expect(200);
    expect(res.body).toMatchObject({ name: 'Sala A', capacity: 20, active: true });
    await ctx
      .http()
      .patch('/resources/00000000-0000-4000-8000-000000000000')
      .set(bearer(admin))
      .send({ capacity: 1 })
      .expect(404);
  });

  it('PATCH não permite renomear para um nome já usado (409); DELETE de id inexistente dá 404', async () => {
    await createResource(ctx, admin, 'Sala A');
    const b = await createResource(ctx, admin, 'Sala B');
    await ctx.http().patch(`/resources/${b.id}`).set(bearer(admin)).send({ name: 'Sala A' }).expect(409);
    await ctx.http().delete('/resources/00000000-0000-4000-8000-000000000000').set(bearer(admin)).expect(404);
  });

  it('valida o formato do id', async () => {
    await ctx.http().get('/resources/nao-e-uuid').set(bearer(user)).expect(400);
  });

  describe('GET /resources/:id/availability', () => {
    it('devolve horários ocupados e janelas livres, sem expor quem reservou', async () => {
      const resource = await createResource(ctx, admin, 'Sala A');
      const start = futureDate(3, 10, 0);
      const book = (from: Date, to: Date) =>
        ctx
          .http()
          .post('/bookings')
          .set(bearer(user))
          .send({ resourceId: resource.id, startsAt: from, endsAt: to })
          .expect(201);
      await book(start, addMinutes(start, 60)); // 10:00-11:00
      await book(addMinutes(start, 180), addMinutes(start, 240)); // 13:00-14:00

      const dayStart = futureDate(3, 8, 0);
      const dayEnd = futureDate(3, 18, 0);
      const res = await ctx
        .http()
        .get(`/resources/${resource.id}/availability`)
        .query({ from: dayStart.toISOString(), to: dayEnd.toISOString() })
        .set(bearer(admin))
        .expect(200);

      const hours = (slots: { startsAt: string; endsAt: string }[]) =>
        slots.map((s) => [new Date(s.startsAt).getUTCHours(), new Date(s.endsAt).getUTCHours()]);
      expect(hours(res.body.busy)).toEqual([
        [10, 11],
        [13, 14],
      ]);
      expect(hours(res.body.free)).toEqual([
        [8, 10],
        [11, 13],
        [14, 18],
      ]);
      expect(JSON.stringify(res.body)).not.toContain(user.id);
    });

    it('valida o período', async () => {
      const resource = await createResource(ctx, admin, 'Sala A');
      const from = futureDate(1);
      await ctx
        .http()
        .get(`/resources/${resource.id}/availability`)
        .query({ from: from.toISOString(), to: addMinutes(from, -60).toISOString() })
        .set(bearer(user))
        .expect(400);
      await ctx
        .http()
        .get(`/resources/${resource.id}/availability`)
        .query({ from: from.toISOString(), to: addMinutes(from, 32 * 24 * 60).toISOString() })
        .set(bearer(user))
        .expect(400);
      await ctx
        .http()
        .get(`/resources/${resource.id}/availability`)
        .query({ from: 'x' })
        .set(bearer(user))
        .expect(400);
    });
  });
});
