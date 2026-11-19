import { z } from 'zod';

const booleanFromString = z.enum(['true', 'false']).transform((v) => v === 'true');

/**
 * Todas as variáveis de ambiente que a aplicação lê, com tipo, limites e valores padrão.
 * A aplicação não sobe se alguma estiver inválida (falhar cedo é melhor que falhar em produção).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa ter ao menos 32 caracteres'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),

  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
  AUTH_THROTTLE_LIMIT: z.coerce.number().int().positive().default(10),

  CANCELLATION_MIN_HOURS: z.coerce.number().min(0).default(2),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  TRUST_PROXY: booleanFromString.default(false),
  SWAGGER_ENABLED: booleanFromString.default(true),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Configuração de ambiente inválida:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
