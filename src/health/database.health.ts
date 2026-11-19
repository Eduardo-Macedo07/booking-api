import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly indicator: HealthIndicatorService,
    private readonly prisma: PrismaService,
  ) {}

  isHealthy(key: string) {
    return this.indicator
      .check(key)
      .attempt(() => this.prisma.$queryRaw`SELECT 1`)
      .withTimeout('2s');
  }
}
