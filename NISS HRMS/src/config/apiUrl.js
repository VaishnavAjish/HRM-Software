// API base URL configuration for the mobile app.

export const PROD_API_URL = 'http://192.168.1.53:8000/api';

export function resolveApiBaseUrl({ envUrl } = {}) {
  const candidate = String(envUrl || '').trim();
  if (candidate) {
    return candidate.replace(/\/+$/, '');
  }
  return PROD_API_URL;
}

const ENV_URL = typeof process !== 'undefined' && process.env ? process.env.EXPO_PUBLIC_API_URL : undefined;

export const API_BASE_URL = resolveApiBaseUrl({ envUrl: ENV_URL });
