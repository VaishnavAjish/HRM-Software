// API base URL selection for the mobile app.
//
// Pure, testable resolver kept free of React Native imports so it can run under
// plain Node in CI. The rules:
//   - Prefer EXPO_PUBLIC_API_URL when provided.
//   - Fall back to the production HTTPS API.
//   - Cleartext HTTP is permitted ONLY in explicit development; a http:// URL in
//     a production build is refused (it would ship credentials/JWTs/PII in the
//     clear) and the secure production URL is used instead.

export const PROD_API_URL = 'https://niss.pro/api';

export function resolveApiBaseUrl({ envUrl, isDev } = {}) {
  const candidate = String(envUrl || '').trim();

  if (candidate) {
    const isCleartext = /^http:\/\//i.test(candidate);
    if (isCleartext && !isDev) {
      return PROD_API_URL;
    }
    return candidate.replace(/\/+$/, '');
  }

  return PROD_API_URL;
}

const IS_DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
const ENV_URL = typeof process !== 'undefined' && process.env ? process.env.EXPO_PUBLIC_API_URL : undefined;

export const API_BASE_URL = resolveApiBaseUrl({ envUrl: ENV_URL, isDev: IS_DEV });
