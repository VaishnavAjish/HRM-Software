import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SAF_DIR_KEY = 'hrms_pdf_download_dir';

function sanitizeFilename(name) {
  return String(name).replace(/[/\\?%*:|"<>]/g, '-').trim() || 'document';
}

async function getDownloadDirUri() {
  const saved = await AsyncStorage.getItem(SAF_DIR_KEY);
  if (saved) return saved;
  const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!perm.granted) return null;
  await AsyncStorage.setItem(SAF_DIR_KEY, perm.directoryUri);
  return perm.directoryUri;
}

// Saves the PDF directly onto the device (Android: lets the user pick a
// folder once via Storage Access Framework — typically Downloads — then
// remembers it for next time) instead of only opening the OS share sheet.
// Falls back to sharing if SAF isn't available (iOS) or permission is denied.
export async function downloadPdfToDevice(html, filename) {
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const safeFilename = sanitizeFilename(filename).endsWith('.pdf') ? sanitizeFilename(filename) : `${sanitizeFilename(filename)}.pdf`;

  if (FileSystem.StorageAccessFramework) {
    try {
      const dirUri = await getDownloadDirUri();
      if (dirUri) {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        const destUri = await FileSystem.StorageAccessFramework.createFileAsync(dirUri, safeFilename, 'application/pdf');
        await FileSystem.writeAsStringAsync(destUri, base64, { encoding: FileSystem.EncodingType.Base64 });
        return { uri: destUri, saved: true };
      }
    } catch (e) {
      // Directory may have been revoked/moved — clear it and fall back to sharing.
      await AsyncStorage.removeItem(SAF_DIR_KEY);
    }
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: safeFilename, UTI: 'com.adobe.pdf' });
  }
  return { uri, saved: false };
}

export function pdfDocument(title, sections) {
  const sectionHtml = sections
    .map(
      (s) => `
      <div class="section">
        <h2>${escapeHtml(s.title)}</h2>
        <table>
          ${s.rows
            .map(
              ([label, value]) => `
            <tr>
              <td class="label">${escapeHtml(label)}</td>
              <td class="value">${escapeHtml(value == null || value === '' ? '—' : String(value))}</td>
            </tr>`
            )
            .join('')}
        </table>
      </div>`
    )
    .join('');

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #0F172A; padding: 24px; }
        .brand { font-size: 20px; font-weight: 800; color: #4F46E5; margin-bottom: 2px; }
        .title { font-size: 15px; color: #475569; margin-bottom: 20px; }
        .section { margin-bottom: 18px; break-inside: avoid; }
        h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #4F46E5; border-bottom: 1px solid #E2E8F0; padding-bottom: 6px; margin-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 5px 0; font-size: 13px; vertical-align: top; }
        td.label { color: #64748B; width: 45%; }
        td.value { color: #0F172A; font-weight: 600; }
        .footer { margin-top: 24px; font-size: 10px; color: #94A3B8; text-align: center; }
      </style>
    </head>
    <body>
      <div class="brand">NISS Enterprise</div>
      <div class="title">${escapeHtml(title)}</div>
      ${sectionHtml}
      <div class="footer">Generated from the NISS Enterprise HRMS mobile app · ${new Date().toLocaleString('en-IN')}</div>
    </body>
  </html>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
