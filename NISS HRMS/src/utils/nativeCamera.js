import { NativeModules, Platform } from 'react-native';

// Full native capture — permission request AND the camera intent itself —
// built on Android's original startActivityForResult/onActivityResult and
// requestPermissions/onRequestPermissionsResult, deliberately bypassing both
// React Native's legacy permission bridge and androidx.activity's Activity
// Result API (used internally by expo-image-picker's own camera launcher).
// See MainActivity.kt for why both of those were suspected and this one
// isn't. Android-only; unavailable on other platforms.
const { CameraPermissionModule } = NativeModules;

export const nativeCamera = {
  available: Platform.OS === 'android' && Boolean(CameraPermissionModule?.takePicture),
  // Resolves { canceled: true } if the user backed out without a photo,
  // { canceled: false, uri } on success. Throws (with a `.code`, e.g.
  // 'PERMISSION_DENIED') if permission was refused or the camera couldn't launch.
  takePicture: async () => {
    const uri = await CameraPermissionModule.takePicture();
    return uri ? { canceled: false, uri } : { canceled: true };
  },
};
