import { defineConfig, loadEnv, createLogger } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { networkInterfaces } from 'os'

function getWifiIp() {
  const nets = networkInterfaces();
  const results = {};

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        if (!results[name]) {
          results[name] = [];
        }
        results[name].push(net.address);
      }
    }
  }

  // Prioritize "Wi-Fi" interface
  const wifiInterface = Object.keys(results).find(name => name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('wifi'));
  if (wifiInterface && results[wifiInterface].length > 0) {
    return results[wifiInterface][0];
  }

  // Fallback: return the first non-VMware address found
  const otherInterface = Object.keys(results).find(name => !name.toLowerCase().includes('vmware') && !name.toLowerCase().includes('virtual'));
  if (otherInterface && results[otherInterface].length > 0) {
    return results[otherInterface][0];
  }

  return true; // Fallback to all interfaces if detection fails
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const hostIp = getWifiIp();
  const logger = createLogger();
  const originalInfo = logger.info;

  logger.info = (msg, options) => {
    // Suppress "Local" link and empty lines commonly around it
    if (msg.includes('Local:') || msg.includes('localhost')) return;
    originalInfo(msg, options);
  };

  return {
    plugins: [react(), basicSsl()],
    customLogger: logger,
    server: {
      host: hostIp, // Bind to specific IP or all
      hmr: {
        host: hostIp, // Ensure HMR uses the same IP to avoid localhost mismatch
      },
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          secure: false, // Ensure proxy handles self-signed certs if backend was HTTPS (it's HTTP here so fine)
        },
        '/socket.io': {
          target: 'http://127.0.0.1:3000',
          ws: true,
          secure: false,
        },
        '/uploads': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          secure: false,
        }
      }
    }
  }
})
