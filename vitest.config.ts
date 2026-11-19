import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/generated/**',
        'src/main.ts',
        'src/seed.ts',
        'src/**/*.module.ts',
        'src/**/*.spec.ts',
        'src/**/dto/**',
      ],
    },
  },
});
