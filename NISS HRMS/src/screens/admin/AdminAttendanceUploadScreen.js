import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronLeft, UploadCloud } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme';
import { EmptyState } from '../../components/common/EmptyState';

// Deliberately NOT a BulkUploadFlow instance: unlike the employee/salary
// import endpoints (which accept a raw spreadsheet file, parsed server-side),
// the real backend contract here is `POST attendance/import` with
// `{month, year, rows: [{emp_code, days: {day: 'P'|'A'|'H'|'L'}}]}` as JSON —
// verified against AttendanceController::bulkImport. There is no raw-file
// variant. Building this properly needs the spreadsheet parsed client-side
// (a new xlsx-parsing dependency) before it can be submitted in that shape,
// which is a larger, separate piece of work — deferred rather than shipped
// half-right against the wrong contract.
export function AdminAttendanceUploadScreen({ onCancel }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <TouchableOpacity style={styles.backRow} onPress={onCancel} activeOpacity={0.7}>
        <ChevronLeft size={18} color={theme.primary} />
        <Text style={[styles.backText, { color: theme.primary }]}>Attendance</Text>
      </TouchableOpacity>
      <EmptyState
        icon={UploadCloud}
        title="Coming soon"
        message="Bulk attendance upload needs a different mechanism than the employee/salary imports (the sheet must be parsed on the device first) and is planned for a later rollout. Use the grid to mark attendance for now."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 16, marginBottom: 20, marginLeft: 16 },
  backText: { ...typography.body, fontWeight: '600' },
});
