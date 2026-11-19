import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { isUniqueViolation, pgViolation } from './prisma-errors.js';

const prismaError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('boom', { code, clientVersion: 'test', meta });

describe('isUniqueViolation', () => {
  it('reconhece P2002', () => {
    expect(isUniqueViolation(prismaError('P2002'))).toBe(true);
  });
  it('ignora outros erros', () => {
    expect(isUniqueViolation(prismaError('P2025'))).toBe(false);
    expect(isUniqueViolation(new Error('x'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe('pgViolation', () => {
  const adapterError = (originalCode: string, originalMessage: string) =>
    prismaError('P2039', { driverAdapterError: { cause: { originalCode, originalMessage } } });

  it('extrai o código SQLSTATE e o nome da constraint', () => {
    const error = adapterError(
      '23P01',
      'conflicting key value violates exclusion constraint "booking_no_resource_overlap"',
    );
    expect(pgViolation(error)).toEqual({ code: '23P01', constraint: 'booking_no_resource_overlap' });
  });

  it('funciona para CHECK constraints', () => {
    const error = adapterError(
      '23514',
      'new row for relation "Booking" violates check constraint "booking_time_order"',
    );
    expect(pgViolation(error)).toEqual({ code: '23514', constraint: 'booking_time_order' });
  });

  it('devolve a violação mesmo sem nome de constraint na mensagem', () => {
    expect(pgViolation(adapterError('23P01', 'algo inesperado'))).toEqual({
      code: '23P01',
      constraint: undefined,
    });
  });

  it('devolve null para erros que não vêm do driver', () => {
    expect(pgViolation(prismaError('P2002'))).toBeNull();
    expect(pgViolation(prismaError('P2039', {}))).toBeNull();
    expect(pgViolation(new Error('x'))).toBeNull();
    expect(pgViolation(undefined)).toBeNull();
  });
});
