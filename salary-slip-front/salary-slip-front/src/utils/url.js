/* global __PROD_API_URL__ */
const PROD_API_URL =
  typeof __PROD_API_URL__ !== "undefined" ? __PROD_API_URL__ : "";

function getDevBaseUrl() {
  const isLocalHost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  if (isLocalHost) {
    const envUrl = import.meta.env.VITE_API_BASE_URL;
    return envUrl || `${window.location.protocol}//${window.location.hostname}:8000/api`;
  }

  // Any domain or live IP (niss.pro, staging, production) strictly uses window.location.origin
  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin;
  }

  return PROD_API_URL || "";
}

const rawBase = getDevBaseUrl();

export const baseUrl = rawBase ? rawBase.replace(/\/api\/?$/, "") : "";