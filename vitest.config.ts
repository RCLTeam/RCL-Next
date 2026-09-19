import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'node:test': fileURLToPath(new URL('./tests/support/node-test-shim.ts', import.meta.url)),
      'react-dom/server': fileURLToPath(
        new URL('./apps/web/node_modules/react-dom/server.node.js', import.meta.url)
      ),
      'react-dom': fileURLToPath(new URL('./apps/web/node_modules/react-dom', import.meta.url)),
      react: fileURLToPath(new URL('./apps/web/node_modules/react', import.meta.url))
    }
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/**/*.{test,spec}.{ts,tsx}',
      'apps/*/src/**/*.{test,spec}.{ts,tsx}',
      'packages/*/src/**/*.{test,spec}.ts'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.config.*',
        '**/apps/api/src/server.ts',
        '**/apps/api/src/modules/competition/competition.repository.ts',
        '**/packages/database/src/{check,environment,index,migrate,seed}.ts'
      ]
    }
  }
});
