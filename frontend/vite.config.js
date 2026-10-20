import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `npm run dev:celular` usa HTTPS con un certificado de desarrollo (queda dentro
// de node_modules): el navegador del celular solo permite la cámara con HTTPS.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'celular' ? [basicSsl()] : [])],
  server: {
    port: 5173,
    // El navegador llama a /api y Vite lo reenvía al backend: no hace falta CORS.
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } },
  },
  preview: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
}));
