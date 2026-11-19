import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { BookingsService } from './bookings.service.js';

const ana = { id: 'ana', role: 'USER' as const };
const bia = { id: 'bia', role: 'USER' as const };
const admin = { id: 'adm', role: 'ADMIN' as const };

const hours = (n: number) => new Date(Date.now() + n * 3_600_000);
/** Próximo múltiplo de 15 min a pelo menos `n` horas daqui. */
const slotIn = (n: number) => new Date(Math.ceil(hours(n).getTime() / 900_000) * 900_000);
const dto = (startsAt = slotIn(24)) => ({
  resourceId: 'res-1',
  startsAt,
  endsAt: new Date(startsAt.getTime() + 3_600_000),
});

const exclusion = (constraint: string) =>
  new Prisma.PrismaClientKnownRequestError('exclusion', {
    code: 'P2039',
    clientVersion: 'test',
    meta: {
      driverAdapterError: {
        cause: {
          originalCode: '23P01',
          originalMessage: `conflicting key value violates exclusion constraint "${constraint}"`,
        },
      },
    },
  });

function build() {
  const prisma = {
    resource: { findUnique: vi.fn().mockResolvedValue({ id: 'res-1', active: true }) },
    booking: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  };
  const metrics = {
    bookingsCreated: { inc: vi.fn() },
    bookingsCancelled: { inc: vi.fn() },
    bookingsRejected: { inc: vi.fn() },
  };
  const config = { get: () => 2 };
  const service = new BookingsService(prisma as never, metrics as never, config as never);
  return { service, prisma, metrics };
}

describe('BookingsService', () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  describe('create', () => {
    it('cria a reserva em nome do usuário autenticado e conta a métrica', async () => {
      ctx.prisma.booking.create.mockResolvedValue({ id: 'b1' });
      const input = dto();

      await expect(ctx.service.create(ana, input)).resolves.toEqual({ id: 'b1' });

      expect(ctx.prisma.booking.create.mock.calls[0]![0].data).toMatchObject({
        userId: 'ana',
        resourceId: 'res-1',
      });
      expect(ctx.metrics.bookingsCreated.inc).toHaveBeenCalledOnce();
    });

    it('não consulta o banco quando o intervalo é inválido', async () => {
      const past = new Date(Date.now() - 3_600_000);
      await expect(ctx.service.create(ana, dto(past))).rejects.toBeInstanceOf(BadRequestException);
      expect(ctx.prisma.resource.findUnique).not.toHaveBeenCalled();
      expect(ctx.metrics.bookingsRejected.inc).toHaveBeenCalledWith({ reason: 'invalid_window' });
    });

    it('404 se o recurso não existe', async () => {
      ctx.prisma.resource.findUnique.mockResolvedValue(null);
      await expect(ctx.service.create(ana, dto())).rejects.toBeInstanceOf(NotFoundException);
    });

    it('422 se o recurso está inativo', async () => {
      ctx.prisma.resource.findUnique.mockResolvedValue({ id: 'res-1', active: false });
      await expect(ctx.service.create(ana, dto())).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(ctx.prisma.booking.create).not.toHaveBeenCalled();
    });

    it('traduz conflito de recurso (constraint do banco) em 409 BOOKING_OVERLAP', async () => {
      ctx.prisma.booking.create.mockRejectedValue(exclusion('booking_no_resource_overlap'));
      const error = await ctx.service.create(ana, dto()).catch((e) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({ code: 'BOOKING_OVERLAP' });
      expect(ctx.metrics.bookingsRejected.inc).toHaveBeenCalledWith({ reason: 'resource_overlap' });
      expect(ctx.metrics.bookingsCreated.inc).not.toHaveBeenCalled();
    });

    it('traduz conflito do próprio usuário em 409 USER_OVERLAP', async () => {
      ctx.prisma.booking.create.mockRejectedValue(exclusion('booking_no_user_overlap'));
      const error = await ctx.service.create(ana, dto()).catch((e) => e);
      expect(error.getResponse()).toMatchObject({ code: 'USER_OVERLAP' });
      expect(ctx.metrics.bookingsRejected.inc).toHaveBeenCalledWith({ reason: 'user_overlap' });
    });

    it('não engole erros inesperados do banco', async () => {
      ctx.prisma.booking.create.mockRejectedValue(new Error('conexão perdida'));
      await expect(ctx.service.create(ana, dto())).rejects.toThrow('conexão perdida');
    });
  });

  describe('cancel', () => {
    const stored = (overrides: object = {}) => ({
      id: 'b1',
      userId: 'ana',
      status: 'CONFIRMED',
      startsAt: slotIn(24),
      ...overrides,
    });

    it('o dono cancela e a métrica registra quem cancelou', async () => {
      ctx.prisma.booking.findUnique.mockResolvedValue(stored());
      ctx.prisma.booking.updateMany.mockResolvedValue({ count: 1 });
      await ctx.service.cancel(ana, 'b1');
      expect(ctx.prisma.booking.updateMany).toHaveBeenCalledWith({
        where: { id: 'b1', status: 'CONFIRMED' },
        data: { status: 'CANCELLED', cancelledAt: expect.any(Date) },
      });
      expect(ctx.metrics.bookingsCancelled.inc).toHaveBeenCalledWith({ by: 'owner' });
    });

    it('reserva de outra pessoa parece inexistente (404)', async () => {
      ctx.prisma.booking.findUnique.mockResolvedValue(stored());
      await expect(ctx.service.cancel(bia, 'b1')).rejects.toBeInstanceOf(NotFoundException);
      expect(ctx.prisma.booking.updateMany).not.toHaveBeenCalled();
    });

    it('já cancelada: 409', async () => {
      ctx.prisma.booking.findUnique.mockResolvedValue(stored({ status: 'CANCELLED' }));
      await expect(ctx.service.cancel(ana, 'b1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('fora do prazo: 422 para o usuário, mas o admin consegue', async () => {
      ctx.prisma.booking.findUnique.mockResolvedValue(stored({ startsAt: slotIn(1) }));
      await expect(ctx.service.cancel(ana, 'b1')).rejects.toBeInstanceOf(UnprocessableEntityException);

      ctx.prisma.booking.updateMany.mockResolvedValue({ count: 1 });
      await expect(ctx.service.cancel(admin, 'b1')).resolves.toBeDefined();
      expect(ctx.metrics.bookingsCancelled.inc).toHaveBeenCalledWith({ by: 'admin' });
    });

    it('cancelamentos simultâneos: o que perde a corrida recebe 409 e não conta a métrica', async () => {
      ctx.prisma.booking.findUnique.mockResolvedValue(stored());
      ctx.prisma.booking.updateMany.mockResolvedValue({ count: 0 });
      await expect(ctx.service.cancel(ana, 'b1')).rejects.toBeInstanceOf(ConflictException);
      expect(ctx.metrics.bookingsCancelled.inc).not.toHaveBeenCalled();
    });
  });
});
