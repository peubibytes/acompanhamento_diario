import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Testes de tela: React em jsdom, falando com a API de verdade (banco em memória), ver test/api.ts.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.tsx'],
    setupFiles: ['test/setup.ts'],
    css: false,
    // Digitar com user-event é lento (um evento por tecla), mais ainda no CI: 5 s (o padrão) não basta.
    testTimeout: 15_000,
  },
});
