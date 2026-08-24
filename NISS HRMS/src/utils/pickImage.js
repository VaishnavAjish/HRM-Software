import { Alert } from 'react-native';
function getImagePicker() { try { return require('expo-image-picker'); } catch(e) { return null; } }
import { captureCameraPhoto, CameraPermissionError } from './cameraCapture';
import { offerSettingsShortcut } from './withTimeout';

const LIBRARY_OPTIONS = { mediaTypes: 'Images', quality: 0.7 };

/**
 * Presents a Camera / Gallery chooser and resolves { uri, fileName, mimeType }
 * — or null if the user cancels at any point, including backing out of a
 * permission prompt. Shared by the ticket-creation attachments picker and the
 * chat composer's "+" button, so both go through the same (working) camera path.
 */
export function pickImage() {
  return new Promise((resolve) => {
    Alert.alert('Add a photo', undefined, [
      {
        text: 'Camera',
        onPress: async () => {
          try {
            const result = await captureCameraPhoto();
            resolve(result.canceled ? null : { uri: result.uri, fileName: result.fileName, mimeType: result.mimeType });
          } catch (e) {
            if (e instanceof CameraPermissionError) {
              offerSettingsShortcut('Camera permission needed', e.message);
            } else {
              Alert.alert('Could not open the camera', e?.message || 'Please try again.');
            }
            resolve(null);
          }
        },
      },
      {
        text: 'Gallery',
        onPress: async () => {
          try {
            const ImagePicker = getImagePicker(); if (!ImagePicker) return null; const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
              Alert.alert('Photo library permission needed', 'Enable photo access to choose a picture.');
              resolve(null);
              return;
            }
            const res = await ImagePicker.launchImageLibraryAsync(LIBRARY_OPTIONS);
            if (res.canceled || !res.assets?.[0]) {
              resolve(null);
              return;
            }
            const asset = res.assets[0];
            resolve({ uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType });
          } catch (e) {
            Alert.alert('Could not open the gallery', e?.message || 'Please try again.');
            resolve(null);
          }
        },
      },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}
