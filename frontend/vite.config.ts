import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Backend dev server target for the /api and /socket.io proxy below.
const BACKEND_DEV_URL = process.env.BACKEND_DEV_URL ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': BACKEND_DEV_URL,
      '/socket.io': { target: BACKEND_DEV_URL, ws: true },
    },
  },
});
