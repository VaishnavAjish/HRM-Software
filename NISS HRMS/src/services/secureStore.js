// Secure credential storage for the mobile app.

import { TOKEN_KEY, userScopedKeysToClear } from '../config/storageKeys';

const memoryStore = new Map();

function getNativeSecureStore() {
  try {
    const ss = require('expo-secure-store');
    if (ss && typeof ss.getItemAsync === 'function') return ss;
  } catch (e) {}
  return null;
}

function getNativeAsyncStorage() {
  try {
    const as = require('@react-native-async-storage/async-storage');
    const storage = as.default || as;
    if (storage && typeof storage.getItem === 'function') return storage;
  } catch (e) {}
  return null;
}

export async function saveToken(token, tokenType = 'Bearer') {
  const val = JSON.stringify({ token, tokenType: tokenType || 'Bearer' });
  const ss = getNativeSecureStore();
  if (ss) {
    try { await ss.setItemAsync(TOKEN_KEY, val); return; } catch (e) {}
  }
  const as = getNativeAsyncStorage();
  if (as) {
    try { await as.setItem(TOKEN_KEY, val); return; } catch (e) {}
  }
  memoryStore.set(TOKEN_KEY, val);
}

export async function loadToken() {
  try {
    const ss = getNativeSecureStore();
    let raw = null;
    if (ss) {
      try { raw = await ss.getItemAsync(TOKEN_KEY); } catch (e) {}
    }
    if (!raw) {
      const as = getNativeAsyncStorage();
      if (as) {
        try { raw = await as.getItem(TOKEN_KEY); } catch (e) {}
      }
    }
    if (!raw) {
      raw = memoryStore.get(TOKEN_KEY) || null;
    }
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export async function clearToken() {
  const ss = getNativeSecureStore();
  if (ss) { try { await ss.deleteItemAsync(TOKEN_KEY); } catch (e) {} }
  const as = getNativeAsyncStorage();
  if (as) { try { await as.removeItem(TOKEN_KEY); } catch (e) {} }
  memoryStore.delete(TOKEN_KEY);
}

/** Remove every user-derived cache, preserving device-only preferences. */
export async function clearUserScopedCaches() {
  const as = getNativeAsyncStorage();
  if (as) {
    try { await as.multiRemove(userScopedKeysToClear()); } catch (e) {}
  }
}
