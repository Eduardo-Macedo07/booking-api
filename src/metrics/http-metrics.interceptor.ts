import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { MetricsService } from './metrics.service.js';

/** Mede a duração de cada requisição, rotulando pela rota (e não pela URL) para manter baixa a cardinalidade. */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const end = this.metrics.httpDuration.startTimer();

    const record = () => {
      const route = (request.route as { path?: string } | undefined)?.path ?? 'unmatched';
      if (route === '/metrics') return;
      end({ method: request.method, route, status_code: String(response.statusCode) });
    };
    // `finish` dispara depois que a resposta (inclusive a de erro) foi escrita, com o status final.
    response.once('finish', record);
    return next.handle();
  }
}
