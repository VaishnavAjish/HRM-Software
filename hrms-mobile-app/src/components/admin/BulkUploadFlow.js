import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Download, FileUp, UploadCloud, CheckCircle2, AlertCircle, X, Trash2, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme';
import { api } from '../../services/api';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { LoadingView } from '../../components/common/LoadingView';
import { EmptyState } from '../../components/common/EmptyState';
import { downloadTextFileToDevice, buildCsvTemplate } from '../../utils/fileDownload';
import { timeAgo } from '../../utils/format';

const SPREADSHEET_MIME_TYPES = [
  'text/csv',
  'text/comma-separated-values',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

function BatchDetailModal({ type, batchId, visible, onClose, onDeleted }) {
  const { theme } = useTheme();
  const [batch, setBatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!visible || !batchId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getUploadBatchDetail(type, batchId);
        if (cancelled) return;
        if (res?.status) setBatch(res.data);
        else setError(res?.message || 'Could not load this upload.');
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Could not load this upload.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, batchId, type]);

  const confirmDelete = () => {
    Alert.alert('Delete this upload', 'This removes the upload history and, where safely reversible, the records it created.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            const res = await api.deleteUploadBatch(type, batchId);
            if (res?.status !== false) {
              onDeleted();
            } else {
              Alert.alert('Could not delete', res?.message || 'Please try again.');
            }
          } catch (e) {
            Alert.alert('Could not delete', e?.message || 'Please try again.');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const rows = batch?.rows || [];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modalScreen, { backgroundColor: theme.background }]}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Upload Report</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <X size={22} color={theme.textPrimary} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <LoadingView label="Loading report…" />
        ) : error ? (
          <EmptyState icon={AlertCircle} title="Couldn't load report" message={error} tone="error" />
        ) : (
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Card style={styles.summaryCard} elevated>
              <Text style={[styles.summaryFile, { color: theme.textPrimary }]}>{batch.file_name}</Text>
              <View style={styles.summaryBadgeRow}>
                <Badge label={`${batch.success_count} imported`} variant="emerald" />
                {Number(batch.failed_count) > 0 ? <Badge label={`${batch.failed_count} failed`} variant="rose" /> : null}
              </View>
            </Card>

            {rows.map((r) => (
              <Card key={r.id} style={[styles.rowCard, r.status === 'failed' && { borderColor: theme.rose + '40' }]} elevated>
                <View style={styles.rowCardHeader}>
                  <Text style={[styles.rowCardTitle, { color: theme.textPrimary }]}>Row {r.row_number}</Text>
                  <Badge label={r.status === 'passed' ? 'Imported' : 'Failed'} variant={r.status === 'passed' ? 'emerald' : 'rose'} size="small" />
                </View>
                {r.reason ? <Text style={[styles.rowCardReason, { color: theme.rose }]}>{r.reason}</Text> : null}
              </Card>
            ))}

            <TouchableOpacity style={[styles.deleteBtn, { backgroundColor: theme.roseBg }]} onPress={confirmDelete} disabled={deleting}>
              {deleting ? <ActivityIndicator size="small" color={theme.rose} /> : <Trash2 size={16} color={theme.rose} />}
              <Text style={[styles.deleteBtnText, { color: theme.rose }]}>Delete This Upload</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

/**
 * Reusable submit → report → history flow shared by the employee/salary/
 * attendance bulk imports. `type` must match the backend's upload-batch type
 * segment ("employee" | "salary" | "attendance"). `getColumns` (optional)
 * powers the "Download Template" button; `uploadFn` receives the built
 * FormData and must return the standard {status, imported, skipped, batch_id}
 * response. `extraFields` (optional) renders extra pre-upload inputs (e.g.
 * company/month/year pickers) and their values are merged into the FormData.
 * `fileFieldName` must match the backend's multipart field name for the
 * uploaded file — it is NOT the same across all three types ("file" for
 * employees, "salary_slip" for salary — verified against the real
 * controllers, not assumed).
 */
export function BulkUploadFlow({ type, title, getColumns, uploadFn, renderExtraFields, extra, templateFilename, fileFieldName = 'file' }) {
  const { theme } = useTheme();
  const [pickedFile, setPickedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [batches, setBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [openBatchId, setOpenBatchId] = useState(null);

  const loadBatches = useCallback(async () => {
    setLoadingBatches(true);
    try {
      const res = await api.getUploadBatches(type, { limit: 10 });
      if (res?.status) setBatches(res.data || []);
    } catch (e) {
      // Recent-uploads history is a convenience panel — a failure here
      // shouldn't block the upload flow itself.
    } finally {
      setLoadingBatches(false);
    }
  }, [type]);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  const downloadTemplate = async () => {
    if (!getColumns) return;
    setDownloadingTemplate(true);
    try {
      const res = await getColumns();
      const columns = res?.data || [];
      if (!columns.length) {
        Alert.alert('Could not build template', 'No column list was returned.');
        return;
      }
      const csv = buildCsvTemplate(columns);
      await downloadTextFileToDevice(csv, templateFilename || `${type}-import-template.csv`, 'text/csv');
    } catch (e) {
      Alert.alert('Could not download template', e?.message || 'Please try again.');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: SPREADSHEET_MIME_TYPES, copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      setPickedFile(res.assets[0]);
      setResult(null);
      setError(null);
    } catch (e) {
      Alert.alert('Could not open file picker', e?.message || 'Please try again.');
    }
  };

  const submit = async () => {
    if (!pickedFile) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append(fileFieldName, {
        uri: pickedFile.uri,
        name: pickedFile.name || `${type}-import.csv`,
        type: pickedFile.mimeType || 'text/csv',
      });
      if (extra) {
        Object.entries(extra).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') fd.append(k, String(v));
        });
      }
      const res = await uploadFn(fd);
      if (res?.status) {
        setResult(res);
        setPickedFile(null);
        loadBatches();
      } else {
        setError(res?.message || 'Import failed.');
      }
    } catch (e) {
      setError(e?.message || 'Import failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>

      {renderExtraFields ? <Card style={styles.card} elevated>{renderExtraFields()}</Card> : null}

      <Card style={styles.card} elevated>
        {error ? <Text style={[styles.errorText, { color: theme.rose }]}>{error}</Text> : null}

        {result ? (
          <View style={styles.resultWrap}>
            <CheckCircle2 size={32} color={theme.emerald} />
            <Text style={[styles.resultTitle, { color: theme.textPrimary }]}>{result.message || 'Import complete'}</Text>
            <View style={styles.resultBadgeRow}>
              <Badge label={`${result.imported ?? 0} imported`} variant="emerald" />
              {result.skipped?.length ? <Badge label={`${result.skipped.length} skipped`} variant="rose" /> : null}
            </View>
            {result.skipped?.length ? (
              <View style={styles.skippedList}>
                {result.skipped.slice(0, 10).map((s, idx) => (
                  <Text key={idx} style={[styles.skippedItem, { color: theme.textMuted }]}>{s}</Text>
                ))}
                {result.skipped.length > 10 ? (
                  <Text style={[styles.skippedItem, { color: theme.textMuted }]}>+{result.skipped.length - 10} more — see the full report below</Text>
                ) : null}
              </View>
            ) : null}
            <Button title="Upload Another File" variant="outline" onPress={() => setResult(null)} style={{ marginTop: 14 }} />
          </View>
        ) : (
          <>
            {getColumns ? (
              <TouchableOpacity style={styles.actionRow} onPress={downloadTemplate} disabled={downloadingTemplate}>
                <View style={[styles.actionIconWrap, { backgroundColor: theme.cyanBg }]}>
                  {downloadingTemplate ? <ActivityIndicator size="small" color={theme.cyan} /> : <Download size={18} color={theme.cyan} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.actionTitle, { color: theme.textPrimary }]}>Download Template</Text>
                  <Text style={[styles.actionSubtitle, { color: theme.textMuted }]}>A blank spreadsheet with the correct column headers</Text>
                </View>
                <ChevronRight size={18} color={theme.textMuted} />
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={styles.actionRow} onPress={pickFile}>
              <View style={[styles.actionIconWrap, { backgroundColor: theme.primary + '15' }]}>
                <FileUp size={18} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionTitle, { color: theme.textPrimary }]}>{pickedFile ? pickedFile.name : 'Choose File'}</Text>
                <Text style={[styles.actionSubtitle, { color: theme.textMuted }]}>{pickedFile ? 'Tap to choose a different file' : 'CSV or Excel (.xlsx)'}</Text>
              </View>
              <ChevronRight size={18} color={theme.textMuted} />
            </TouchableOpacity>

            <Button
              title="Upload"
              variant="gradient"
              icon={UploadCloud}
              onPress={submit}
              loading={uploading}
              disabled={!pickedFile}
              style={{ marginTop: 14 }}
            />
          </>
        )}
      </Card>

      <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Recent Uploads</Text>
      {loadingBatches ? (
        <LoadingView label="Loading history…" />
      ) : batches.length === 0 ? (
        <EmptyState icon={UploadCloud} title="No uploads yet" />
      ) : (
        <Card style={styles.listCard}>
          {batches.map((b, idx) => (
            <TouchableOpacity
              key={b.id}
              style={[styles.batchRow, idx !== batches.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}
              onPress={() => setOpenBatchId(b.id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.batchName, { color: theme.textPrimary }]} numberOfLines={1}>{b.file_name}</Text>
                <Text style={[styles.batchMeta, { color: theme.textMuted }]}>{timeAgo(b.created_at)}</Text>
              </View>
              <Badge label={`${b.success_count} ok`} variant="emerald" size="small" />
              {Number(b.failed_count) > 0 ? <Badge label={`${b.failed_count} failed`} variant="rose" size="small" style={{ marginLeft: 6 }} /> : null}
              <ChevronRight size={16} color={theme.textMuted} style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          ))}
        </Card>
      )}

      <BatchDetailModal
        type={type}
        batchId={openBatchId}
        visible={Boolean(openBatchId)}
        onClose={() => setOpenBatchId(null)}
        onDeleted={() => { setOpenBatchId(null); loadBatches(); }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 60 },
  title: { ...typography.h2, marginBottom: 16 },
  card: { marginBottom: 16 },
  errorText: { ...typography.caption, marginBottom: 10 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  actionIconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { ...typography.body, fontWeight: '700' },
  actionSubtitle: { ...typography.caption, marginTop: 2 },
  resultWrap: { alignItems: 'center', paddingVertical: 12 },
  resultTitle: { ...typography.h4, marginTop: 10, textAlign: 'center' },
  resultBadgeRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  skippedList: { width: '100%', marginTop: 14 },
  skippedItem: { ...typography.caption, marginBottom: 4 },
  sectionTitle: { ...typography.h3, marginTop: 6, marginBottom: 10 },
  listCard: { padding: 4 },
  batchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12 },
  batchName: { ...typography.body, fontWeight: '600' },
  batchMeta: { ...typography.micro, marginTop: 2 },
  modalScreen: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16 },
  modalTitle: { ...typography.h3 },
  modalContent: { padding: 16, paddingBottom: 40 },
  summaryCard: { marginBottom: 12 },
  summaryFile: { ...typography.h4, marginBottom: 8 },
  summaryBadgeRow: { flexDirection: 'row', gap: 8 },
  rowCard: { marginBottom: 8, padding: 12 },
  rowCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowCardTitle: { ...typography.body, fontWeight: '700' },
  rowCardReason: { ...typography.caption, marginTop: 6 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 14, marginTop: 8 },
  deleteBtnText: { ...typography.body, fontWeight: '700' },
});
