/* global __PROD_API_URL__ */
const PROD_API_URL =
  typeof __PROD_API_URL__ !== "undefined" ? __PROD_API_URL__ : "";

const ENV = import.meta.env.VITE_ENV;

function getDevBaseUrl() {
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    return window.location.origin;
  }

  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && typeof window !== "undefined" && window.location.hostname) {
    try {
      const u = new URL(envUrl, window.location.origin);
      if (
        (u.hostname === "localhost" || u.hostname === "127.0.0.1") &&
        window.location.hostname !== "localhost" &&
        window.location.hostname !== "127.0.0.1"
      ) {
        u.hostname = window.location.hostname;
        return u.toString();
      }
    } catch {
      // ignore
    }
    return envUrl;
  }
  if (typeof window !== "undefined" && window.location.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:8000/api`;
  }
  return "http://127.0.0.1:8000/api";
}

const rawBase =
  typeof window !== "undefined" && window.location.protocol === "https:"
    ? (import.meta.env.VITE_API_BASE_URL || window.location.origin)
    : ENV === "DEV"
      ? getDevBaseUrl()
      : ENV === "STAG"
        ? import.meta.env.VITE_STAGING_URL
        : PROD_API_URL;

export const baseUrl = rawBase ? rawBase.replace(/\/api\/?$/, "") : "";