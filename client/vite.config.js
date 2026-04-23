import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const normalizeDevTarget = (value) => {
    const raw = (value || '').trim();
    if (!raw) return 'http://127.0.0.1:3000';
    return raw.replace('://localhost', '://127.0.0.1');
  };
  
  // In local development, proxy to the local backend by default.
  // VITE_API_URL is still used for non-dev builds / deployments.
  const backendTarget =
    mode === 'development'
      ? normalizeDevTarget(env.VITE_DEV_API_URL)
      : (env.VITE_API_URL || 'http://localhost:3000');
  const useDevHttps = String(env.VITE_DEV_HTTPS || '').toLowerCase() === 'true';

  return {
    plugins: useDevHttps ? [react(), basicSsl()] : [react()],
    server: {
      host: true, // Listens on all local IPs in dev mode
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
        },
        '/socket.io': {
          target: backendTarget,
          changeOrigin: true,
          ws: true,
          secure: false,
        },
        '/uploads': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
        }
      }
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1600,
    }
  }
})
