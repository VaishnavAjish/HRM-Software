import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
function getImagePicker() { try { return require('expo-image-picker'); } catch(e) { return null; } }
import { Camera, ImagePlus, X, FileCheck } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme';
import { offerSettingsShortcut } from '../../utils/withTimeout';
import { captureCameraPhoto, CameraPermissionError } from '../../utils/cameraCapture';

const IMAGE_OPTIONS = {
  mediaTypes: 'Images',
  quality: 0.7,
  allowsEditing: false,
};

// `value` is either a { uri, name, type } object staged for upload, or a plain
// URL string when showing a document already stored on the record being edited.
export function ImagePickerField({ label, value, onChange, cameraOnly = false }) {
  const { theme } = useTheme();
  const [busy, setBusy] = useState(false);

  const previewUri = typeof value === 'string' ? value : value?.uri;

  const fromCamera = async () => {
    setBusy(true);
    try {
      const result = await captureCameraPhoto();
      if (!result.canceled) {
        applyAsset({ uri: result.uri, fileName: result.fileName, mimeType: result.mimeType });
      }
    } catch (e) {
      if (e instanceof CameraPermissionError) {
        offerSettingsShortcut('Camera permission needed', e.message);
      } else {
        // Without this the rejection vanishes and the button just appears
        // dead — no dialog, no log, no camera.
        Alert.alert('Could not open the camera', e?.message || 'Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const fromLibrary = async () => {
    const ImagePicker = getImagePicker(); if (!ImagePicker) return; const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo library permission needed', 'Enable photo access to choose a file.');
      return;
    }
    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync(IMAGE_OPTIONS);
      if (!result.canceled && result.assets?.[0]) {
        applyAsset(result.assets[0]);
      }
    } catch (e) {
      Alert.alert('Could not open the gallery', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const applyAsset = (asset) => {
    const name = asset.fileName || `upload-${Date.now()}.jpg`;
    onChange({ uri: asset.uri, name, type: asset.mimeType || 'image/jpeg' });
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      <View style={styles.row}>
        {previewUri ? (
          <View style={styles.previewWrap}>
            <Image source={{ uri: previewUri }} style={[styles.preview, { borderColor: theme.border }]} />
            {value ? (
              <TouchableOpacity style={[styles.clearBtn, { backgroundColor: theme.rose }]} onPress={() => onChange(null)}>
                <X size={12} color="#FFFFFF" />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <View style={[styles.previewWrap, styles.placeholder, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
            <FileCheck size={22} color={theme.textMuted} />
          </View>
        )}

        <View style={styles.buttonCol}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: theme.primary + '15', borderColor: theme.primary + '40' }]}
            onPress={fromCamera}
            disabled={busy}
          >
            <Camera size={14} color={theme.primary} />
            <Text style={[styles.actionText, { color: theme.primary }]}>Camera</Text>
          </TouchableOpacity>
          {!cameraOnly && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
              onPress={fromLibrary}
              disabled={busy}
            >
              <ImagePlus size={14} color={theme.textPrimary} />
              <Text style={[styles.actionText, { color: theme.textPrimary }]}>Gallery</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  label: {
    ...typography.caption,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  previewWrap: {
    position: 'relative',
  },
  preview: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: 1,
  },
  placeholder: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCol: {
    flex: 1,
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionText: {
    ...typography.caption,
    fontWeight: '600',
  },
});
