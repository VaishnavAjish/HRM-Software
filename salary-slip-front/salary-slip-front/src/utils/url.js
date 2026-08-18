/* global __PROD_API_URL__ */
const PROD_API_URL =
  typeof __PROD_API_URL__ !== "undefined" ? __PROD_API_URL__ : "";

function getDevBaseUrl() {
  if (typeof window === "undefined") {
    return PROD_API_URL || "";
  }

  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl) return envUrl;

  // In production builds, always default to current window origin so Nginx
  // routes /api/ requests to PHP-FPM FastCGI directly on ports 80/443.
  if (import.meta.env.PROD || !import.meta.env.DEV) {
    return window.location.origin;
  }

  const hostname = window.location.hostname;
  const port = window.location.port;

  // Local development detection: running on Vite dev server ports (e.g. 5173, 5174, 5175, 5176)
  const isDevPort = Boolean(port && ["5173", "5174", "5175", "5176", "3000"].includes(port));

  if (isDevPort) {
    const host = hostname === "localhost" ? "127.0.0.1" : hostname;
    return `${window.location.protocol}//${host}:8000/api`;
  }

  if (window.location.origin) {
    return window.location.origin;
  }

  return PROD_API_URL || "";
}

const rawBase = getDevBaseUrl();

export const baseUrl = rawBase ? rawBase.replace(/\/api\/?$/, "") : "";