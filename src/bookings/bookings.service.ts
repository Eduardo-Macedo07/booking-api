import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '../common/auth-user.js';
import { skipTake, toPage } from '../common/pagination.js';
import type { Env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { pgViolation } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { decideCancellation, validateBookingWindow } from './booking-rules.js';
import type { CreateBookingDto, ListBookingsQueryDto } from './dto/booking.dto.js';

/** Códigos do Postgres que o banco usa para garantir as regras (ver migration init). */
const EXCLUSION_VIOLATION = '23P01';
const USER_OVERLAP_CONSTRAINT = 'booking_no_user_overlap';

const include = { resource: { select: { id: true, name: true } } } satisfies Prisma.BookingInclude;

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async create(actor: AuthUser, dto: CreateBookingDto) {
    const problem = validateBookingWindow(dto.startsAt, dto.endsAt, new Date());
    if (problem) {
      this.metrics.bookingsRejected.inc({ reason: 'invalid_window' });
      throw new BadRequestException({ message: problem, code: 'INVALID_BOOKING_WINDOW' });
    }

    const resource = await this.prisma.resource.findUnique({ where: { id: dto.resourceId } });
    if (!resource) throw new NotFoundException('Resource not found');
    if (!resource.active) {
      this.metrics.bookingsRejected.inc({ reason: 'resource_inactive' });
      throw new UnprocessableEntityException({
        message: 'This resource is not accepting bookings',
        code: 'RESOURCE_INACTIVE',
      });
    }

    try {
      // Não há "consultar se está livre e depois inserir": isso permitiria corrida entre duas requisições.
      // Inserimos direto e deixamos o banco (EXCLUDE constraint) decidir de forma atômica.
      const booking = await this.prisma.booking.create({
        data: {
          resourceId: dto.resourceId,
          userId: actor.id,
          startsAt: dto.startsAt,
          endsAt: dto.endsAt,
          notes: dto.notes,
        },
        include,
      });
      this.metrics.bookingsCreated.inc();
      return booking;
    } catch (error) {
      const violation = pgViolation(error);
      if (violation?.code === EXCLUSION_VIOLATION) {
        if (violation.constraint === USER_OVERLAP_CONSTRAINT) {
          this.metrics.bookingsRejected.inc({ reason: 'user_overlap' });
          throw new ConflictException({
            message: 'You already have a booking during this period',
            code: 'USER_OVERLAP',
          });
        }
        this.metrics.bookingsRejected.inc({ reason: 'resource_overlap' });
        throw new ConflictException({
          message: 'The resource is already booked for part of this period',
          code: 'BOOKING_OVERLAP',
        });
      }
      throw error;
    }
  }

  async list(actor: AuthUser, query: ListBookingsQueryDto) {
    const isAdmin = actor.role === 'ADMIN';
    if (!isAdmin && query.userId && query.userId !== actor.id) {
      throw new ForbiddenException('You can only list your own bookings');
    }
    const where: Prisma.BookingWhereInput = {
      userId: isAdmin ? query.userId : actor.id,
      resourceId: query.resourceId,
      status: query.status,
      ...(query.from ? { endsAt: { gt: query.from } } : {}),
      ...(query.to ? { startsAt: { lt: query.to } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({ where, include, orderBy: { startsAt: 'desc' }, ...skipTake(query) }),
      this.prisma.booking.count({ where }),
    ]);
    return toPage(data, total, query);
  }

  async get(actor: AuthUser, id: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id }, include });
    // Reserva de outra pessoa responde 404 (e não 403): não revela que o id existe.
    if (!booking || (actor.role !== 'ADMIN' && booking.userId !== actor.id)) {
      throw new NotFoundException('Booking not found');
    }
    return booking;
  }

  async cancel(actor: AuthUser, id: string) {
    const booking = await this.get(actor, id);
    if (booking.status === 'CANCELLED') {
      throw new ConflictException({ message: 'Booking is already cancelled', code: 'ALREADY_CANCELLED' });
    }

    const now = new Date();
    const decision = decideCancellation(
      booking,
      actor,
      now,
      this.config.get('CANCELLATION_MIN_HOURS', { infer: true }),
    );
    if (!decision.allowed) {
      this.metrics.bookingsRejected.inc({ reason: 'cancellation_window' });
      throw new UnprocessableEntityException({
        message: decision.reason,
        code: 'CANCELLATION_WINDOW_CLOSED',
      });
    }

    // Só cancela se ainda estiver confirmada: dois cancelamentos simultâneos não contam duas vezes.
    const { count } = await this.prisma.booking.updateMany({
      where: { id, status: 'CONFIRMED' },
      data: { status: 'CANCELLED', cancelledAt: now },
    });
    if (count === 0) {
      throw new ConflictException({ message: 'Booking is already cancelled', code: 'ALREADY_CANCELLED' });
    }
    this.metrics.bookingsCancelled.inc({ by: actor.role === 'ADMIN' ? 'admin' : 'owner' });
    return this.get(actor, id);
  }
}
