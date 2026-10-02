import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // reachable from other devices on your LAN
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
});
