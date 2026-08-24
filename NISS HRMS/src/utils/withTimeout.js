import { Alert, Linking } from 'react-native';

/**
 * Races a promise against a timer so a native module call that never resolves
 * — seen on some Android developer-preview builds, where a permission API the
 * installed expo-modules-core doesn't recognise silently no-ops instead of
 * rejecting — fails loudly instead of leaving the UI stuck forever with no
 * error, no dialog, and a button that looks dead.
 */
export function withTimeout(promise, ms, label = 'This request') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out. Your Android version or emulator image may not support this yet.`));
    }, ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

/**
 * When the OS permission dialog itself is unresponsive, retrying in-app can't
 * help — Settings is the one place that grants the permission without going
 * through that broken dialog at all.
 */
export function offerSettingsShortcut(title, message) {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Open Settings', onPress: () => Linking.openSettings() },
  ]);
}
