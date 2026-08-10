/* global __APP_COLOR__ */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const appColor = typeof __APP_COLOR__ !== 'undefined' ? __APP_COLOR__ : 'indigo';
document.documentElement.dataset.theme = appColor;

// Unregister legacy service workers & clear caches to prevent stale bundles from probing local network
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (let registration of registrations) {
      registration.unregister();
    }
  });
  if (window.caches) {
    caches.keys().then((keys) => {
      keys.forEach((key) => caches.delete(key));
    });
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
