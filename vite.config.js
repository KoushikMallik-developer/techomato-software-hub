import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' + HashRouter means the built site works on any static host or sub-folder.
export default defineConfig({
  base: './',
  plugins: [react()],
});
