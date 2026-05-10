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

window.addEventListener('unhandledrejection', (event) => {
  const message = String(event.reason?.message || event.reason || '');
  if (message.includes('A listener indicated an asynchronous response by returning true') &&
      message.includes('message channel closed before a response was received')) {
    event.preventDefault();
  }
});

const app = <App />;

createRoot(document.getElementById('root')).render(
  import.meta.env.DEV ? app : <StrictMode>{app}</StrictMode>,
)
