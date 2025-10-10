import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.pdf'],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5050',
        changeOrigin: true,
        secure: false,
        // 👇 important: allow full path passthrough
        rewrite: path => path.replace(/^\/api/, '/api'),
      },
    },
  },
});
