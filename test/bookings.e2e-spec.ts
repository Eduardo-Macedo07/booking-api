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
  soon,
  type TestContext,
  type TestUser,
} from './helpers.js';

describe('Bookings (e2e)', () => {
  let ctx: TestContext;
  let admin: TestUser;
  let ana: TestUser;
  let bia: TestUser;
  let room: { id: string; name: string };

  const book = (who: TestUser, resourceId: string, startsAt: Date, endsAt: Date, extra: object = {}) =>
    ctx
      .http()
      .post('/bookings')
      .set(bearer(who))
      .send({ resourceId, startsAt, endsAt, ...extra });

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    admin = await registerAdmin(ctx);
    ana = await registerUser(ctx, { name: 'Ana' });
    bia = await registerUser(ctx, { name: 'Bia' });
    room = await createResource(ctx, admin, 'Sala A');
  });

  describe('criação', () => {
    it('cria uma reserva confirmada', async () => {
      const start = futureDate(2, 14, 0);
      const res = await book(ana, room.id, start, addMinutes(start, 90), {
        notes: 'Reunião de equipe',
      }).expect(201);
      expect(res.body).toMatchObject({
        resourceId: room.id,
        userId: ana.id,
        status: 'CONFIRMED',
        notes: 'Reunião de equipe',
        resource: { id: room.id, name: 'Sala A' },
      });
      expect(new Date(res.body.startsAt).toISOString()).toBe(start.toISOString());
    });

    it('recusa reservar o mesmo horário (409 BOOKING_OVERLAP)', async () => {
      const start = futureDate(2, 14, 0);
      await book(ana, room.id, start, addMinutes(start, 60)).expect(201);
      const res = await book(bia, room.id, start, addMinutes(start, 60)).expect(409);
      expect(res.body.code).toBe('BOOKING_OVERLAP');
    });

    it.each([
      ['começa no meio de outra', 30, 90],
      ['termina no meio de outra', -30, 30],
      ['engloba outra', -30, 90],
      ['está dentro de outra', 15, 45],
    ])('recusa sobreposição parcial: reserva que %s', async (_nome, startOffset, endOffset) => {
      const start = futureDate(2, 14, 0);
      await book(ana, room.id, start, addMinutes(start, 60)).expect(201);
      await book(bia, room.id, addMinutes(start, startOffset), addMinutes(start, endOffset)).expect(409);
    });

    it('permite reservas coladas (uma termina quando a outra começa)', async () => {
      const start = futureDate(2, 14, 0);
      await book(ana, room.id, start, addMinutes(start, 60)).expect(201);
      await book(bia, room.id, addMinutes(start, 60), addMinutes(start, 120)).expect(201);
      await book(bia, room.id, addMinutes(start, -60), start).expect(201);
    });

    it('recursos diferentes no mesmo horário não conflitam', async () => {
      const other = await createResource(ctx, admin, 'Sala B');
      const start = futureDate(2, 14, 0);
      await book(ana, room.id, start, addMinutes(start, 60)).expect(201);
      await book(bia, other.id, start, addMinutes(start, 60)).expect(201);
    });

    it('um usuário não pode estar em duas reservas ao mesmo tempo (409 USER_OVERLAP)', async () => {
      const other = await createResource(ctx, admin, 'Sala B');
      const start = futureDate(2, 14, 0);
      await book(ana, room.id, start, addMinutes(start, 60)).expect(201);
      const res = await book(ana, other.id, addMinutes(start, 30), addMinutes(start, 90)).expect(409);
      expect(res.body.code).toBe('USER_OVERLAP');
    });

    describe('regras do intervalo (400 INVALID_BOOKING_WINDOW)', () => {
      it.each([
        ['no passado', () => [addMinutes(new Date(), -120), addMinutes(new Date(), -60)]],
        ['fim antes do início', () => [futureDate(2, 15), futureDate(2, 14)]],
        ['duração zero', () => [futureDate(2, 14), futureDate(2, 14)]],
        ['fora dos múltiplos de 15 min', () => [futureDate(2, 14, 7), futureDate(2, 15, 0)]],
        ['mais longa que 8 horas', () => [futureDate(2, 8), futureDate(2, 17)]],
      ])('recusa reserva %s', async (_nome, makeWindow) => {
        const [start, end] = makeWindow() as [Date, Date];
        const res = await book(ana, room.id, start, end).expect(400);
        expect(res.body.code).toBe('INVALID_BOOKING_WINDOW');
      });

      it('aceita exatamente 8 horas e exatamente 15 minutos', async () => {
        await book(ana, room.id, futureDate(2, 8), futureDate(2, 16)).expect(201);
        await book(bia, room.id, futureDate(3, 8), futureDate(3, 8, 15)).expect(201);
      });
    });

    it('valida o corpo da requisição', async () => {
      await ctx.http().post('/bookings').set(bearer(ana)).send({}).expect(400);
      await book(ana, 'nao-e-uuid', futureDate(2), futureDate(2, 15)).expect(400);
      await ctx
        .http()
        .post('/bookings')
        .set(bearer(ana))
        .send({ resourceId: room.id, startsAt: 'ontem', endsAt: 'amanhã' })
        .expect(400);
      // userId vem do token, nunca do corpo: tentar reservar "em nome de" outro é rejeitado
      await book(ana, room.id, futureDate(2), futureDate(2, 15), { userId: bia.id }).expect(400);
    });

    it('404 para recurso inexistente; 422 para recurso inativo', async () => {
      await book(ana, '00000000-0000-4000-8000-000000000000', futureDate(2), futureDate(2, 15)).expect(404);

      await ctx.http().delete(`/resources/${room.id}`).set(bearer(admin)).expect(204);
      const res = await book(ana, room.id, futureDate(2), futureDate(2, 15)).expect(422);
      expect(res.body.code).toBe('RESOURCE_INACTIVE');
    });
  });

  describe('cancelamento', () => {
    it('o dono cancela, e o horário volta a ficar livre', async () => {
      const start = futureDate(2, 14, 0);
      const created = await book(ana, room.id, start, addMinutes(start, 60)).expect(201);

      const cancelled = await ctx
        .http()
        .post(`/bookings/${created.body.id}/cancel`)
        .set(bearer(ana))
        .expect(200);
      expect(cancelled.body.status).toBe('CANCELLED');
      expect(cancelled.body.cancelledAt).toEqual(expect.any(String));

      await book(bia, room.id, start, addMinutes(start, 60)).expect(201);
    });

    it('cancelar duas vezes dá 409', async () => {
      const start = futureDate(2, 14, 0);
      const created = await book(ana, room.id, start, addMinutes(start, 60)).expect(201);
      await ctx.http().post(`/bookings/${created.body.id}/cancel`).set(bearer(ana)).expect(200);
      const again = await ctx.http().post(`/bookings/${created.body.id}/cancel`).set(bearer(ana)).expect(409);
      expect(again.body.code).toBe('ALREADY_CANCELLED');
    });

    it('usuário comum não cancela em cima da hora (422), mas o admin pode', async () => {
      const start = soon(30); // começa em menos de 2 horas
      const created = await book(ana, room.id, start, addMinutes(start, 60)).expect(201);

      const denied = await ctx
        .http()
        .post(`/bookings/${created.body.id}/cancel`)
        .set(bearer(ana))
        .expect(422);
      expect(denied.body.code).toBe('CANCELLATION_WINDOW_CLOSED');

      const byAdmin = await ctx
        .http()
        .post(`/bookings/${created.body.id}/cancel`)
        .set(bearer(admin))
        .expect(200);
      expect(byAdmin.body.status).toBe('CANCELLED');
    });

    it('não permite cancelar a reserva de outra pessoa', async () => {
      const start = futureDate(2, 14, 0);
      const created = await book(ana, room.id, start, addMinutes(start, 60)).expect(201);
      await ctx.http().post(`/bookings/${created.body.id}/cancel`).set(bearer(bia)).expect(404);
    });
  });

  describe('consulta e controle de acesso', () => {
    it('usuário comum só enxerga as próprias reservas; outras respondem 404', async () => {
      const start = futureDate(2, 14, 0);
      const anas = await book(ana, room.id, start, addMinutes(start, 60)).expect(201);
      await book(bia, room.id, addMinutes(start, 60), addMinutes(start, 120)).expect(201);

      const list = await ctx.http().get('/bookings').set(bearer(ana)).expect(200);
      expect(list.body.meta.total).toBe(1);
      expect(list.body.data[0].userId).toBe(ana.id);

      await ctx.http().get(`/bookings/${anas.body.id}`).set(bearer(ana)).expect(200);
      await ctx.http().get(`/bookings/${anas.body.id}`).set(bearer(bia)).expect(404);
      await ctx.http().get(`/bookings?userId=${bia.id}`).set(bearer(ana)).expect(403);
    });

    it('admin vê todas e filtra por usuário, recurso, status e período, com paginação', async () => {
      const other = await createResource(ctx, admin, 'Sala B');
      const day = (n: number) => futureDate(n, 10, 0);
      await book(ana, room.id, day(2), addMinutes(day(2), 60)).expect(201);
      await book(ana, room.id, day(3), addMinutes(day(3), 60)).expect(201);
      const toCancel = await book(bia, other.id, day(4), addMinutes(day(4), 60)).expect(201);
      await ctx.http().post(`/bookings/${toCancel.body.id}/cancel`).set(bearer(bia)).expect(200);

      const all = await ctx.http().get('/bookings').set(bearer(admin)).expect(200);
      expect(all.body.meta.total).toBe(3);

      const byUser = await ctx.http().get(`/bookings?userId=${ana.id}`).set(bearer(admin)).expect(200);
      expect(byUser.body.meta.total).toBe(2);

      const byResource = await ctx
        .http()
        .get(`/bookings?resourceId=${other.id}`)
        .set(bearer(admin))
        .expect(200);
      expect(byResource.body.meta.total).toBe(1);

      const confirmed = await ctx.http().get('/bookings?status=CONFIRMED').set(bearer(admin)).expect(200);
      expect(confirmed.body.meta.total).toBe(2);

      const window = await ctx
        .http()
        .get('/bookings')
        .query({ from: day(3).toISOString(), to: addMinutes(day(3), 60).toISOString() })
        .set(bearer(admin))
        .expect(200);
      expect(window.body.meta.total).toBe(1);

      const paged = await ctx.http().get('/bookings?limit=2&page=2').set(bearer(admin)).expect(200);
      expect(paged.body.data).toHaveLength(1);
      expect(paged.body.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });

      await ctx.http().get('/bookings?status=QUALQUER').set(bearer(admin)).expect(400);
    });
  });
});
