import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import seo from './vite-seo.js';

// BrowserRouter needs absolute asset paths and an SPA rewrite on the host (see vercel.json).
export default defineConfig({
  base: '/',
  plugins: [react(), seo()],
});
