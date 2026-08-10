import { NativeModules, Platform } from 'react-native';

// A second, independent path to the CAMERA permission dialog — see
// android/.../MainActivity.kt for the full story. expo-image-picker's own
// requestCameraPermissionsAsync() hangs forever on some Android
// developer-preview builds, because it goes through React Native's legacy
// PermissionAwareActivity bridge whose OS callback has been observed to never
// fire. This talks to a small native module built on Android's current
// ActivityResultContracts.RequestPermission() API instead, which does not
// share that broken forwarding chain. Android-only; unavailable elsewhere.
const { CameraPermissionModule } = NativeModules;

export const nativeCameraPermission = {
  available: Platform.OS === 'android' && Boolean(CameraPermissionModule),
  isGranted: () => CameraPermissionModule.isGranted(),
  request: () => CameraPermissionModule.requestPermission(),
};
