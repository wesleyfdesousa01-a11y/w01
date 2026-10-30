import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Em desenvolvimento, a API e o WebSocket vêm do servidor Node (npm start, porta 3005).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3005',
      '/events': { target: 'ws://localhost:3005', ws: true },
    },
  },
});
