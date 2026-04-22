import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  // In local development, proxy to the local backend by default.
  // VITE_API_URL is still used for non-dev builds / deployments.
  const backendTarget =
    mode === 'development'
      ? (env.VITE_DEV_API_URL || 'http://localhost:3000')
      : (env.VITE_API_URL || 'http://localhost:3000');

  return {
    plugins: [react(), basicSsl()],
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
