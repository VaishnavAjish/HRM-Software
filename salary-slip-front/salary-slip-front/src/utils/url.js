/* global __PROD_API_URL__ */
const PROD_API_URL =
  typeof __PROD_API_URL__ !== "undefined" ? __PROD_API_URL__ : "";

const ENV = import.meta.env.VITE_ENV;

const rawBase =
  ENV === "DEV"
    ? import.meta.env.VITE_API_BASE_URL
    : ENV === "STAG"
      ? import.meta.env.VITE_STAGING_URL
      : PROD_API_URL;

export const baseUrl = rawBase ? rawBase.replace(/\/api\/?$/, "") : "";