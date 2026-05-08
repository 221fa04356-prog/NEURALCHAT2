import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import axios from 'axios';

const hostname = window.location.hostname || '';
const isLanOrLocal =
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  hostname.startsWith('192.168.') ||
  hostname.startsWith('10.') ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);

// For local/LAN development, use Vite proxy so requests hit local backend.
// For deployed environments, respect VITE_API_URL.
axios.defaults.baseURL = isLanOrLocal ? '' : (import.meta.env.VITE_API_URL || '');
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token && !config.headers?.Authorization && !config.headers?.authorization) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const app = <App />;

createRoot(document.getElementById('root')).render(
  import.meta.env.DEV ? app : <StrictMode>{app}</StrictMode>,
)
