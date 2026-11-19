import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Histogram, Registry } from '@prometheus-io/client';

/**
 * Métricas no formato Prometheus.
 * Usa um Registry próprio (não o global) para que testes e múltiplas instâncias não colidam.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duração das requisições HTTP em segundos',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });

  readonly bookingsCreated = new Counter({
    name: 'bookings_created_total',
    help: 'Reservas criadas com sucesso',
    registers: [this.registry],
  });

  readonly bookingsCancelled = new Counter({
    name: 'bookings_cancelled_total',
    help: 'Reservas canceladas',
    labelNames: ['by'] as const,
    registers: [this.registry],
  });

  readonly bookingsRejected = new Counter({
    name: 'bookings_rejected_total',
    help: 'Reservas recusadas por regra de negócio',
    labelNames: ['reason'] as const,
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }
}
