/* global __PROD_API_URL__ */
const PROD_API_URL =
  typeof __PROD_API_URL__ !== "undefined" ? __PROD_API_URL__ : "";

function getDevBaseUrl() {
  if (typeof window === "undefined") {
    return PROD_API_URL || "";
  }

  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl) return envUrl;

  const hostname = window.location.hostname;

  // Local development fallback is strictly limited to localhost or 127.0.0.1 loopback interfaces.
  // Any public, production, or staged domain (e.g. niss.pro, www.niss.pro) strictly uses window.location.origin
  // to guarantee zero probes to port 8000, 127.0.0.1, or local IP addresses.
  const isLoopbackDev = hostname === "localhost" || hostname === "127.0.0.1";

  if (isLoopbackDev) {
    return `${window.location.protocol}//${hostname}:8000/api`;
  }

  if (window.location.origin) {
    return window.location.origin;
  }

  return PROD_API_URL || "";
}

const rawBase = getDevBaseUrl();

export const baseUrl = rawBase ? rawBase.replace(/\/api\/?$/, "") : "";