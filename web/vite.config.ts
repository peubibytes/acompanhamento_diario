import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // 127.0.0.1 de propósito: a API só escuta no loopback IPv4 (ver HOST em server/src/index.ts).
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
});
