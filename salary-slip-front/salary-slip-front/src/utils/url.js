/* global __PROD_API_URL__ */
const PROD_API_URL =
  typeof __PROD_API_URL__ !== "undefined" ? __PROD_API_URL__ : "";

const ENV = import.meta.env.VITE_ENV;

function getDevBaseUrl() {
  const isLocalHost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  if (!isLocalHost && typeof window !== "undefined" && window.location.hostname) {
    return window.location.origin;
  }

  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl) {
    return envUrl;
  }

  if (isLocalHost) {
    return `${window.location.protocol}//${window.location.hostname}:8000/api`;
  }

  return "";
}

const rawBase =
  typeof window !== "undefined" &&
  (window.location.hostname === "niss.pro" ||
    window.location.protocol === "https:" ||
    (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"))
    ? (import.meta.env.VITE_API_BASE_URL || window.location.origin)
    : ENV === "DEV"
      ? getDevBaseUrl()
      : ENV === "STAG"
        ? import.meta.env.VITE_STAGING_URL
        : PROD_API_URL;

export const baseUrl = rawBase ? rawBase.replace(/\/api\/?$/, "") : "";