import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../common/decorators.js';
import { MetricsService } from './metrics.service.js';

/**
 * Endpoint de scrape do Prometheus. Não exige token porque é destinado à rede interna:
 * em produção, não o exponha publicamente no proxy reverso (ver docs/DEPLOY.md).
 */
@ApiExcludeController()
@SkipThrottle()
@Public()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  async scrape(@Res({ passthrough: true }) res: Response): Promise<string> {
    res.setHeader('Content-Type', this.metrics.registry.contentType);
    return this.metrics.registry.metrics();
  }
}
