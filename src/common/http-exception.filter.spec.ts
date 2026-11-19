import { type ArgumentsHost, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from './http-exception.filter.js';

function run(exception: unknown, requestId = 'req-1') {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ id: requestId, url: '/x' }),
    }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return { status: status.mock.calls[0]![0] as number, body: json.mock.calls[0]![0] };
}

describe('AllExceptionsFilter', () => {
  beforeAll(() => {
    // o filtro registra erros 500 no log; aqui isso é esperado e só poluiria a saída
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('mantém status e mensagem das exceções HTTP e acrescenta o requestId', () => {
    const { status, body } = run(new NotFoundException('Booking not found'));
    expect(status).toBe(404);
    expect(body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Booking not found',
      requestId: 'req-1',
    });
  });

  it('preserva o `code` de erros de negócio', () => {
    const { status, body } = run(new ConflictException({ message: 'ocupado', code: 'BOOKING_OVERLAP' }));
    expect(status).toBe(409);
    expect(body).toMatchObject({ error: 'Conflict', message: 'ocupado', code: 'BOOKING_OVERLAP' });
  });

  it('não vaza detalhes de erros inesperados', () => {
    const { status, body } = run(new Error('senha do banco: hunter2'));
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(body).toMatchObject({ statusCode: 500, message: 'Internal server error', requestId: 'req-1' });
  });
});
