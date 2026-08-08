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
  const port = window.location.port;

  const isLocalDev =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
    port === "5173" ||
    port === "5174" ||
    port === "5175" ||
    port === "3000";

  if (isLocalDev) {
    return `${window.location.protocol}//${hostname}:8000/api`;
  }

  // Any production domain strictly uses window.location.origin
  if (window.location.origin) {
    return window.location.origin;
  }

  return PROD_API_URL || "";
}

const rawBase = getDevBaseUrl();

export const baseUrl = rawBase ? rawBase.replace(/\/api\/?$/, "") : "";