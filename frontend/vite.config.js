import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `npm run dev:celular` usa HTTPS con un certificado de desarrollo (queda dentro
// de node_modules): el navegador del celular solo permite la cámara con HTTPS.
// La prueba en el navegador (e2e/) usa su propia API: la indica con API_DESTINO.
const API = process.env.API_DESTINO ?? 'http://localhost:3000';

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'celular' ? [basicSsl()] : [])],
  server: {
    port: 5173,
    // El navegador llama a /api y Vite lo reenvía al backend: no hace falta CORS.
    proxy: { '/api': { target: API, changeOrigin: false } },
  },
  preview: { port: 5173, proxy: { '/api': API } },
}));
