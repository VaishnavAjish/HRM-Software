// Pure-helper tests, runnable with `node --test` (no jest/native deps).
// Covers API URL selection and logout storage-key cleanup.

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveApiBaseUrl, PROD_API_URL } from '../src/config/apiUrl.js';
import {
  userScopedKeysToClear,
  DEVICE_ONLY_KEYS,
  USER_SCOPED_KEYS,
  TOKEN_KEY,
} from '../src/config/storageKeys.js';

test('no env URL falls back to the production HTTPS API', () => {
  assert.equal(resolveApiBaseUrl({ envUrl: undefined, isDev: false }), PROD_API_URL);
  assert.equal(resolveApiBaseUrl({ envUrl: '', isDev: true }), PROD_API_URL);
});

test('an https env URL is used verbatim (trailing slash trimmed)', () => {
  assert.equal(resolveApiBaseUrl({ envUrl: 'https://staging.niss.pro/api/', isDev: false }), 'https://staging.niss.pro/api');
});

test('cleartext http is allowed only in development', () => {
  assert.equal(resolveApiBaseUrl({ envUrl: 'http://192.168.1.53:8000/api', isDev: true }), 'http://192.168.1.53:8000/api');
});

test('cleartext http in production is refused and falls back to prod https', () => {
  assert.equal(resolveApiBaseUrl({ envUrl: 'http://192.168.1.53:8000/api', isDev: false }), PROD_API_URL);
});

test('the production fallback is https', () => {
  assert.match(PROD_API_URL, /^https:\/\//);
});

test('logout clears user-scoped caches but preserves device-only preferences', () => {
  const toClear = userScopedKeysToClear();

  // Dashboard caches and notification state are cleared.
  assert.ok(toClear.includes('admin_dashboard_cache'));
  assert.ok(toClear.includes('emp_dashboard_cache'));
  assert.ok(toClear.includes('hrms_notif_read_local'));
  assert.ok(toClear.includes('hrms_notif_dismissed_local'));
  assert.ok(toClear.includes('hrms_notif_surfaced'));
  // The legacy AsyncStorage session key is cleared too.
  assert.ok(toClear.includes('hrms_auth_session'));

  // Device-only preferences survive.
  for (const key of DEVICE_ONLY_KEYS) {
    assert.ok(!toClear.includes(key), `device-only key ${key} must not be cleared`);
  }
  assert.ok(DEVICE_ONLY_KEYS.includes('hrms_pdf_download_dir'));
});

test('the secure token key is not an AsyncStorage user-scoped key', () => {
  // The JWT lives in SecureStore under TOKEN_KEY, never in the AsyncStorage set.
  assert.ok(!USER_SCOPED_KEYS.includes(TOKEN_KEY));
});
