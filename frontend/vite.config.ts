import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Ensure lucide-react is pre-bundled to avoid runtime requests to individual icon modules
  optimizeDeps: {
    // Pre-bundle lucide-react to ensure icons are bundled into vendor build
    // This prevents per-icon ESM requests (which can be blocked by ad-blockers)
    include: ['lucide-react'],
  },
  server: {
    port: 3001,
    host: true,
    cors: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 3001,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, '/api'),
      },
    },
  },
  define: {
    'process.env.VITE_API_URL': JSON.stringify('http://localhost:5001/api'),
  },
});
