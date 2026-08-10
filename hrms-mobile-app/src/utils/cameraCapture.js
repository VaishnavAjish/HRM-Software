import * as ImagePicker from 'expo-image-picker';
import { withTimeout } from './withTimeout';
import { nativeCamera } from './nativeCamera';

export class CameraPermissionError extends Error {
  constructor(message) {
    super(message);
    this.code = 'PERMISSION';
  }
}

/**
 * Takes a photo and returns { canceled: true } or { canceled: false, uri,
 * fileName, mimeType }. Throws CameraPermissionError if permission was
 * refused, or a plain Error (with whatever diagnostic message the native side
 * produced) for any other failure.
 *
 * Goes through the native module first — see MainActivity.kt — since both of
 * expo-image-picker's own mechanisms (its permission request and its camera
 * launcher) have been observed to hang indefinitely on some Android
 * developer-preview builds, with the camera still working fine in every other
 * app on the same device. Only platforms without that native module (iOS)
 * fall through to expo-image-picker's own flow.
 */
export async function captureCameraPhoto() {
  if (nativeCamera.available) {
    let result;
    try {
      result = await withTimeout(nativeCamera.takePicture(), 60000, 'Camera');
    } catch (e) {
      if (e?.code === 'PERMISSION_DENIED') {
        throw new CameraPermissionError('Camera permission was denied. Enable it for this app in Settings, then try again.');
      }
      throw e;
    }
    if (result.canceled) return { canceled: true };
    return { canceled: false, uri: result.uri, fileName: `camera-${Date.now()}.jpg`, mimeType: 'image/jpeg' };
  }

  let perm = await withTimeout(ImagePicker.getCameraPermissionsAsync(), 5000, 'Camera permission check');
  if (!perm.granted) {
    perm = await withTimeout(ImagePicker.requestCameraPermissionsAsync(), 8000, 'Camera permission');
  }
  if (!perm.granted) {
    throw new CameraPermissionError('Enable camera access for this app in Settings to take a photo.');
  }

  const res = await withTimeout(
    ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 }),
    60000,
    'Camera'
  );
  if (res.canceled || !res.assets?.[0]) return { canceled: true };
  const asset = res.assets[0];
  return { canceled: false, uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType };
}
