import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
  const httpsFlag = String(env.VITE_DEV_HTTPS || '').toLowerCase();
  const useDevHttps = httpsFlag === 'false' ? false : mode === 'development';
  const certFile = path.resolve(__dirname, 'certs', 'dev-cert.pem');
  const keyFile = path.resolve(__dirname, 'certs', 'dev-key.pem');
  const hasCustomCert = fs.existsSync(certFile) && fs.existsSync(keyFile);
  const httpsConfig = useDevHttps
    ? (
        hasCustomCert
          ? {
              cert: fs.readFileSync(certFile),
              key: fs.readFileSync(keyFile),
            }
          : true
      )
    : undefined;

  return {
    plugins: (useDevHttps && !hasCustomCert) ? [react(), mkcert()] : [react()],
    server: {
      host: true, // Listens on all local IPs in dev mode
      https: httpsConfig,
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
