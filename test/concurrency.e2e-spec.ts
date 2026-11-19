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

/**
 * O teste que justifica a decisão de deixar o banco arbitrar conflitos (docs/adr/0001):
 * muitas requisições simultâneas disputando o mesmo horário.
 */
describe('Concorrência (e2e)', () => {
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

  it('30 usuários disputando o mesmo recurso e horário: exatamente 1 vence', async () => {
    const admin = await registerAdmin(ctx);
    const room = await createResource(ctx, admin, 'Sala A');
    const users = await Promise.all(Array.from({ length: 30 }, () => registerUser(ctx)));
    const start = futureDate(2, 14, 0);

    const results = await Promise.all(
      users.map((user) =>
        ctx
          .http()
          .post('/bookings')
          .set(bearer(user))
          .send({ resourceId: room.id, startsAt: start, endsAt: addMinutes(start, 60) }),
      ),
    );

    const created = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);
    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(29);
    expect(conflicts.every((r) => r.body.code === 'BOOKING_OVERLAP')).toBe(true);
    expect(await ctx.prisma.booking.count({ where: { status: 'CONFIRMED' } })).toBe(1);
  });

  it('requisições com horários parcialmente sobrepostos nunca geram duas reservas conflitantes', async () => {
    const admin = await registerAdmin(ctx);
    const room = await createResource(ctx, admin, 'Sala A');
    const users = await Promise.all(Array.from({ length: 24 }, () => registerUser(ctx)));
    const base = futureDate(2, 9, 0);

    // Janelas de 60 min começando a cada 15 min: muitas se sobrepõem entre si.
    await Promise.all(
      users.map((user, i) =>
        ctx
          .http()
          .post('/bookings')
          .set(bearer(user))
          .send({
            resourceId: room.id,
            startsAt: addMinutes(base, i * 15),
            endsAt: addMinutes(base, i * 15 + 60),
          }),
      ),
    );

    const confirmed = await ctx.prisma.booking.findMany({
      where: { status: 'CONFIRMED' },
      orderBy: { startsAt: 'asc' },
    });
    expect(confirmed.length).toBeGreaterThan(0);
    for (let i = 1; i < confirmed.length; i++) {
      expect(confirmed[i]!.startsAt.getTime()).toBeGreaterThanOrEqual(confirmed[i - 1]!.endsAt.getTime());
    }
  });

  it('o mesmo usuário em vários recursos ao mesmo tempo: exatamente 1 reserva', async () => {
    const admin = await registerAdmin(ctx);
    const ana = await registerUser(ctx);
    const rooms = await Promise.all(
      Array.from({ length: 10 }, (_, i) => createResource(ctx, admin, `Sala ${i}`)),
    );
    const start = futureDate(2, 14, 0);

    const results = await Promise.all(
      rooms.map((room) =>
        ctx
          .http()
          .post('/bookings')
          .set(bearer(ana))
          .send({ resourceId: room.id, startsAt: start, endsAt: addMinutes(start, 60) }),
      ),
    );

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const rejected = results.filter((r) => r.status === 409);
    expect(rejected).toHaveLength(9);
    expect(rejected.every((r) => r.body.code === 'USER_OVERLAP')).toBe(true);
  });
});
