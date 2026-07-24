/* global __APP_COLOR__ */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const appColor = typeof __APP_COLOR__ !== 'undefined' ? __APP_COLOR__ : 'indigo';
document.documentElement.dataset.theme = appColor;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
