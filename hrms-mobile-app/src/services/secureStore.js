// Secure credential storage for the mobile app.
//
// The JWT and its token type are held in the device keystore (Keychain /
// Keystore) via expo-secure-store — never in AsyncStorage, and the full user
// object is never persisted at all (it is re-fetched from the protected profile
// endpoint on cold start). User-derived caches live in AsyncStorage and are
// wiped on logout; device-only preferences are preserved.

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TOKEN_KEY, userScopedKeysToClear } from '../config/storageKeys';

export async function saveToken(token, tokenType = 'Bearer') {
  await SecureStore.setItemAsync(
    TOKEN_KEY,
    JSON.stringify({ token, tokenType: tokenType || 'Bearer' })
  );
}

export async function loadToken() {
  try {
    const raw = await SecureStore.getItemAsync(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export async function clearToken() {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (e) {
    /* non-fatal */
  }
}

/** Remove every user-derived cache, preserving device-only preferences. */
export async function clearUserScopedCaches() {
  try {
    await AsyncStorage.multiRemove(userScopedKeysToClear());
  } catch (e) {
    /* non-fatal */
  }
}
