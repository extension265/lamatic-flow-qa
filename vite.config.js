import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the build works under a GitHub Pages sub-path (/<repo>/).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  // Explicit IPv4: "localhost" makes Node bind only [::1] on Windows, and Firefox
  // sometimes connects over 127.0.0.1 → intermittent NS_ERROR_CONNECTION_REFUSED.
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
