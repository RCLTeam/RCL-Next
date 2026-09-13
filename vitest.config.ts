import { defineConfig } from 'vitest/config';

export default defineConfig({
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
      exclude: ['**/node_modules/**', '**/dist/**', '**/packages/database/**', '**/*.config.*']
    }
  }
});
