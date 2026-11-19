import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../common/auth-user.js';
import { skipTake, toPage } from '../common/pagination.js';
import type { Prisma } from '../generated/prisma/client.js';
import { isUniqueViolation } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { clip, computeFreeWindows } from './availability.js';
import type {
  AvailabilityQueryDto,
  CreateResourceDto,
  ListResourcesQueryDto,
  UpdateResourceDto,
} from './dto/resource.dto.js';

const MAX_AVAILABILITY_DAYS = 31;

@Injectable()
export class ResourcesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListResourcesQueryDto, actor: AuthUser) {
    const where: Prisma.ResourceWhereInput = {
      // Usuários comuns só enxergam recursos ativos; admin pode filtrar.
      active: actor.role === 'ADMIN' ? query.active : true,
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.resource.findMany({ where, orderBy: { name: 'asc' }, ...skipTake(query) }),
      this.prisma.resource.count({ where }),
    ]);
    return toPage(data, total, query);
  }

  async get(id: string, actor: AuthUser) {
    const resource = await this.prisma.resource.findUnique({ where: { id } });
    if (!resource || (!resource.active && actor.role !== 'ADMIN')) {
      throw new NotFoundException('Resource not found');
    }
    return resource;
  }

  async create(dto: CreateResourceDto) {
    try {
      return await this.prisma.resource.create({ data: dto });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('A resource with this name already exists');
      throw error;
    }
  }

  async update(id: string, dto: UpdateResourceDto) {
    try {
      return await this.prisma.resource.update({ where: { id }, data: dto });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('A resource with this name already exists');
      if (isRecordNotFound(error)) throw new NotFoundException('Resource not found');
      throw error;
    }
  }

  /** "Remover" desativa: o histórico de reservas continua íntegro. */
  async deactivate(id: string): Promise<void> {
    try {
      await this.prisma.resource.update({ where: { id }, data: { active: false } });
    } catch (error) {
      if (isRecordNotFound(error)) throw new NotFoundException('Resource not found');
      throw error;
    }
  }

  async availability(id: string, query: AvailabilityQueryDto, actor: AuthUser) {
    const { from, to } = query;
    if (!(from < to)) throw new BadRequestException('"from" must be before "to"');
    if (to.getTime() - from.getTime() > MAX_AVAILABILITY_DAYS * 86_400_000) {
      throw new BadRequestException(`The period cannot exceed ${MAX_AVAILABILITY_DAYS} days`);
    }
    await this.get(id, actor);

    // Só horários: nenhum dado de quem reservou é exposto a usuários comuns.
    const bookings = await this.prisma.booking.findMany({
      where: { resourceId: id, status: 'CONFIRMED', startsAt: { lt: to }, endsAt: { gt: from } },
      orderBy: { startsAt: 'asc' },
      select: { startsAt: true, endsAt: true },
    });
    return {
      resourceId: id,
      from,
      to,
      busy: bookings.map((b) => clip(b, from, to)),
      free: computeFreeWindows(from, to, bookings),
    };
  }
}

function isRecordNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2025';
}
