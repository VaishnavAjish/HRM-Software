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

  // Local development detection: localhost, 127.0.0.1, LAN IPs (192.168.x.x, 10.x.x.x, 172.x.x.x),
  // OR when running on Vite dev server ports (e.g. 5173, 5174, 5175, 5176).
  const isDevPort = Boolean(port && ["5173", "5174", "5175", "5176", "3000"].includes(port));
  const isLocalIp =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname);

  if (isDevPort || (isLocalIp && port !== "")) {
    /*
     * "localhost" is resolved to IPv4 explicitly.
     *
     * Chrome resolves localhost to ::1 first, and on a machine running Docker
     * Desktop or WSL those bind [::1]:8000 for their own forwarding. The request
     * then reaches wslrelay instead of Laravel and comes back 404 — a confusing
     * failure, because the API is running and answering perfectly on IPv4.
     * php artisan serve binds 0.0.0.0, which is IPv4 only, so naming the IPv4
     * loopback is both correct and unambiguous.
     */
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