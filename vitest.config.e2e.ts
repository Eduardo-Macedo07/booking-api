import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup-env.ts'],
    // Todos os arquivos compartilham o mesmo banco: rodam um por vez.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
