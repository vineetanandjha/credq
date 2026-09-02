import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/ads/',
  publicDir: false,
  build: {
    outDir: 'dist/ads',
    emptyOutDir: true
  },
  server: {
    host: '0.0.0.0',
    port: 3000
  }
});