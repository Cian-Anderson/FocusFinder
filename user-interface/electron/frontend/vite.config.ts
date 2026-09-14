import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

// Use relative asset paths so Electron can load files via file://
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'esnext',
    outDir: 'dist',
  },
  server: {
    port: 3000,
    open: false,
  },
});
