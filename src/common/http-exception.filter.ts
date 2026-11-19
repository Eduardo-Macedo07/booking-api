import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  /** Código estável de erro de negócio (ex.: BOOKING_OVERLAP), útil para o cliente da API. */
  code?: string;
  requestId?: string;
}

/**
 * Padroniza o corpo de todos os erros e garante que erros inesperados (500)
 * sejam registrados no log sem vazar detalhes internos ao cliente.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId =
      typeof (request as { id?: unknown }).id === 'string' ? (request as { id: string }).id : undefined;

    let body: ErrorBody;
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const obj = typeof res === 'object' ? (res as Record<string, unknown>) : { message: res };
      body = {
        statusCode: status,
        error: typeof obj['error'] === 'string' ? obj['error'] : (STATUS_CODES[status] ?? 'Error'),
        message: (obj['message'] as string | string[]) ?? exception.message,
        ...(typeof obj['code'] === 'string' ? { code: obj['code'] } : {}),
        requestId,
      };
    } else {
      this.logger.error({ err: exception, requestId, path: request.url }, 'Unhandled exception');
      body = {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
        message: 'Internal server error',
        requestId,
      };
    }
    response.status(body.statusCode).json(body);
  }
}
