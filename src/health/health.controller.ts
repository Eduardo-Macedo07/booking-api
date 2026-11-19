import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../common/decorators.js';
import { DatabaseHealthIndicator } from './database.health.js';

@ApiTags('health')
@SkipThrottle()
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  /** Liveness: o processo está de pé. Não toca em dependências (evita reiniciar o app por falha do banco). */
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  /** Readiness: o app consegue atender requisições (banco respondendo). */
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (verifica o banco de dados)' })
  @HealthCheck()
  ready() {
    return this.health.check([() => this.database.isHealthy('database')]);
  }
}
