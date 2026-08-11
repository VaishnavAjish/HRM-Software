import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Same remembered-folder pattern as downloadPdfToDevice in pdf.js, generalised
// to arbitrary text content (CSV bulk-upload templates) instead of only PDFs.
const SAF_DIR_KEY = 'hrms_pdf_download_dir';

function sanitizeFilename(name) {
  return String(name).replace(/[/\\?%*:|"<>]/g, '-').trim() || 'file';
}

async function getDownloadDirUri() {
  const saved = await AsyncStorage.getItem(SAF_DIR_KEY);
  if (saved) return saved;
  const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!perm.granted) return null;
  await AsyncStorage.setItem(SAF_DIR_KEY, perm.directoryUri);
  return perm.directoryUri;
}

export async function downloadTextFileToDevice(content, filename, mimeType = 'text/csv') {
  const safeFilename = sanitizeFilename(filename);
  const cacheUri = `${FileSystem.cacheDirectory}${safeFilename}`;
  await FileSystem.writeAsStringAsync(cacheUri, content, { encoding: FileSystem.EncodingType.UTF8 });

  if (FileSystem.StorageAccessFramework) {
    try {
      const dirUri = await getDownloadDirUri();
      if (dirUri) {
        const destUri = await FileSystem.StorageAccessFramework.createFileAsync(dirUri, safeFilename, mimeType);
        await FileSystem.writeAsStringAsync(destUri, content, { encoding: FileSystem.EncodingType.UTF8 });
        return { uri: destUri, saved: true };
      }
    } catch (e) {
      await AsyncStorage.removeItem(SAF_DIR_KEY);
    }
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(cacheUri, { mimeType, dialogTitle: safeFilename });
  }
  return { uri: cacheUri, saved: false };
}

const TECHNICAL_COLUMNS = new Set(['id', 'created_at', 'updated_at', 'deleted_at']);

// Builds a CSV whose header row is exactly the backend's expected DB column
// keys — the import endpoint only auto-matches columns without an explicit
// mapping when the header text matches a key verbatim, so a template built
// this way always imports cleanly with no mapping step required. `columns`
// may be either `[{key, label, ...}]` (employee import-columns) or a flat
// array of raw column name strings (salary/attendance import-columns, which
// just introspect the DB table) — both are normalised to a key list here.
export function buildCsvTemplate(columns) {
  const keys = columns
    .map((c) => (typeof c === 'string' ? c : c.key))
    .filter((k) => k && !TECHNICAL_COLUMNS.has(k));
  return `${keys.join(',')}\n`;
}
