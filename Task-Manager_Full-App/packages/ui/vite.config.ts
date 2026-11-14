import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the built files also load inside the Android app (Capacitor).
export default defineConfig({
  plugins: [react()],
  base: './',
  // host + allowedHosts: lets a phone open the dev server through GitHub Codespaces or Wi-Fi.
  server: { host: true, port: 5173, allowedHosts: true },
});
