import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'node:test': fileURLToPath(new URL('./tests/nodeTestShim.ts', import.meta.url))
    }
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/**/*.{test,spec}.ts',
      'packages/*/test/**/*.{test,spec}.ts',
      'apps/*/test/**/*.{test,spec}.ts'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.config.*']
    }
  }
});
