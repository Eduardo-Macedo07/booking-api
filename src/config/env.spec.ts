import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('aplica valores padrão e converte tipos', () => {
    const env = validateEnv({ ...base, PORT: '8080' });
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 8080,
      JWT_ACCESS_TTL_SECONDS: 900,
      REFRESH_TTL_DAYS: 7,
      BCRYPT_COST: 12,
      CANCELLATION_MIN_HOURS: 2,
      TRUST_PROXY: false,
      SWAGGER_ENABLED: true,
      CORS_ORIGINS: [],
    });
  });

  it('interpreta lista de origens CORS e booleanos', () => {
    const env = validateEnv({
      ...base,
      CORS_ORIGINS: ' https://a.com, https://b.com ,, ',
      TRUST_PROXY: 'true',
      SWAGGER_ENABLED: 'false',
    });
    expect(env.CORS_ORIGINS).toEqual(['https://a.com', 'https://b.com']);
    expect(env.TRUST_PROXY).toBe(true);
    expect(env.SWAGGER_ENABLED).toBe(false);
  });

  it('exige DATABASE_URL e JWT_SECRET', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ DATABASE_URL: base.DATABASE_URL })).toThrow(/JWT_SECRET/);
  });

  it('recusa segredo JWT curto', () => {
    expect(() => validateEnv({ ...base, JWT_SECRET: 'curto' })).toThrow(/32 caracteres/);
  });

  it.each([
    ['PORT', '0'],
    ['PORT', 'abc'],
    ['BCRYPT_COST', '2'],
    ['LOG_LEVEL', 'verbose'],
    ['TRUST_PROXY', 'yes'],
    ['NODE_ENV', 'staging'],
  ])('recusa %s=%s', (key, value) => {
    expect(() => validateEnv({ ...base, [key]: value })).toThrow(/Configuração de ambiente inválida/);
  });
});
