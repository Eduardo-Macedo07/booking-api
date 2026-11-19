import { defineConfig } from 'vitest/config';

// Cobertura de TODOS os testes (unitários + e2e). Exige o Postgres de testes migrado (veja o README).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup-env.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/generated/**',
        'src/main.ts',
        'src/seed.ts',
        'src/**/*.module.ts',
        'src/**/*.spec.ts',
        'src/**/dto/**',
      ],
      // Piso: se a cobertura cair abaixo disso, o CI falha.
      thresholds: { statements: 90, branches: 80, functions: 95, lines: 90 },
    },
  },
});
