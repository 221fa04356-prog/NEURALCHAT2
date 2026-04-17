import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import axios from 'axios';

// In local dev, prefer Vite proxy (/api -> localhost:3000) so frontend always
// talks to the latest local backend routes (including Cloudinary upload).
// In production builds, use explicit VITE_API_URL when provided.
axios.defaults.baseURL = import.meta.env.DEV
  ? ''
  : (import.meta.env.VITE_API_URL || '');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
