import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001'
      },
      '/ws/rofl-upload': {
        target: 'ws://127.0.0.1:3001',
        ws: true
      }
    }
  }
});
