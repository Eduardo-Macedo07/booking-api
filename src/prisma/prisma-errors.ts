import { Prisma } from '../generated/prisma/client.js';

/** Violação de unicidade (P2002), por exemplo e-mail ou nome de recurso repetido. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export interface PgViolation {
  /** Código SQLSTATE do Postgres, por exemplo `23P01` (exclusion_violation). */
  code: string;
  /** Nome da constraint violada, quando o Postgres informa. */
  constraint?: string;
}

/**
 * Com o adaptador `pg`, o Prisma 7 reporta violações de EXCLUDE/CHECK como P2039 e deixa o
 * erro original do Postgres em `meta.driverAdapterError.cause`. Esta função extrai esse erro.
 */
export function pgViolation(error: unknown): PgViolation | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
  const cause = (error.meta as { driverAdapterError?: { cause?: Record<string, unknown> } } | undefined)
    ?.driverAdapterError?.cause;
  const code = cause?.['originalCode'];
  if (typeof code !== 'string') return null;
  const message = cause?.['originalMessage'];
  const constraint = typeof message === 'string' ? /constraint "([^"]+)"/.exec(message)?.[1] : undefined;
  return { code, constraint };
}
