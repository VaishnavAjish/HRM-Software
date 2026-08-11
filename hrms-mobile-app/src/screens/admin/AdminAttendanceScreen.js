import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Alert, ActivityIndicator } from 'react-native';
import { CalendarCheck, AlertCircle, Upload, Check } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography, shadows } from '../../theme';
import { api } from '../../services/api';
import { SelectField } from '../../components/common/SelectField';
import { LoadingView } from '../../components/common/LoadingView';
import { EmptyState } from '../../components/common/EmptyState';
import { AttendanceGridView } from '../../components/admin/AttendanceGridView';
import { AdminAttendanceUploadScreen } from './AdminAttendanceUploadScreen';
import { COMPANY_OPTIONS, getCompanyUnits } from '../../utils/companyConfig';
import { monthName } from '../../utils/format';

const CURRENT = new Date();
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: monthName(i + 1) }));
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => String(CURRENT.getFullYear() - i)).map((y) => ({ value: y, label: y }));

const STATUS_OPTIONS = [
  { value: null, label: 'Clear / Unmarked', tint: 'textMuted' },
  { value: 'present', label: 'Present', tint: 'emerald' },
  { value: 'absent', label: 'Absent', tint: 'rose' },
  { value: 'half_day', label: 'Half Day', tint: 'amber' },
  { value: 'leave', label: 'Leave', tint: 'violet' },
];

function StatusPickerModal({ visible, onClose, onSelect, current }) {
  const { theme } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[styles.sheet, { backgroundColor: theme.surfaceCard, borderColor: theme.border }, shadows.glass]}>
          <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>Mark Attendance</Text>
          {STATUS_OPTIONS.map((opt) => {
            const selected = current === opt.value;
            const tint = theme[opt.tint] || theme.textMuted;
            return (
              <TouchableOpacity
                key={opt.label}
                style={[styles.option, selected && { backgroundColor: tint + '15' }]}
                onPress={() => onSelect(opt.value)}
              >
                <Text style={[styles.optionText, { color: tint }]}>{opt.label}</Text>
                {selected ? <Check size={16} color={tint} /> : null}
              </TouchableOpacity>
            );
          })}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

export function AdminAttendanceScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const isUnitScoped = Number(user?.role) === 2;
  const canSwitchCompany = [0, 1].includes(Number(user?.role));

  const [showUpload, setShowUpload] = useState(false);
  const [month, setMonth] = useState(String(CURRENT.getMonth() + 1));
  const [year, setYear] = useState(String(CURRENT.getFullYear()));
  const [companyCode, setCompanyCode] = useState(isUnitScoped ? user.company_code : COMPANY_OPTIONS[0].value);
  const [unit, setUnit] = useState(isUnitScoped ? user.unit : '');
  const unitOptions = canSwitchCompany ? getCompanyUnits(companyCode) : [];

  const [grid, setGrid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingCell, setPendingCell] = useState(null); // { empCode, date, current }
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { month, year };
      if (canSwitchCompany) params.company_code = companyCode;
      if (unit) params.unit = unit;
      const res = await api.getAttendanceGrid(params);
      if (res?.status) {
        setGrid(res.data);
      } else {
        setError(res?.message || 'Could not load the attendance grid.');
      }
    } catch (e) {
      setError(e?.message || 'Could not load the attendance grid.');
    } finally {
      setLoading(false);
    }
  }, [month, year, companyCode, unit, canSwitchCompany]);

  useEffect(() => { load(); }, [load]);

  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

  const handleCellPress = (empCode, date, currentStatus) => {
    setPendingCell({ empCode, date, current: currentStatus });
  };

  const applyStatus = async (status) => {
    if (!pendingCell) return;
    const { empCode, date } = pendingCell;
    setSaving(true);
    try {
      const payload = { emp_code: empCode, date, status, company_code: companyCode, unit };
      const res = await api.upsertAttendanceCell(payload);
      if (res?.status) {
        setGrid((prev) => ({
          ...prev,
          attendance: {
            ...prev.attendance,
            [empCode]: { ...(prev.attendance[empCode] || {}), [date]: status || undefined },
          },
        }));
        setPendingCell(null);
      } else {
        Alert.alert('Could not update', res?.message || 'Please try again.');
      }
    } catch (e) {
      Alert.alert('Could not update', e?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (showUpload) {
    return (
      <AdminAttendanceUploadScreen
        onDone={() => { setShowUpload(false); load(); }}
        onCancel={() => setShowUpload(false)}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.headerArea}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Attendance</Text>
          <TouchableOpacity style={[styles.uploadBtn, { borderColor: theme.border, backgroundColor: theme.surfaceElevated }]} onPress={() => setShowUpload(true)}>
            <Upload size={14} color={theme.primary} />
            <Text style={[styles.uploadBtnText, { color: theme.primary }]}>Bulk Upload</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.filterRow}>
          <View style={{ flex: 1 }}>
            <SelectField value={month} onChange={setMonth} options={MONTH_OPTIONS} searchable={false} />
          </View>
          <View style={{ flex: 1 }}>
            <SelectField value={year} onChange={setYear} options={YEAR_OPTIONS} searchable={false} />
          </View>
        </View>
        {canSwitchCompany ? (
          <View style={styles.filterRow}>
            <View style={{ flex: 1 }}>
              <SelectField value={companyCode} onChange={(v) => { setCompanyCode(v); setUnit(''); }} options={COMPANY_OPTIONS} searchable={false} />
            </View>
            <View style={{ flex: 1 }}>
              <SelectField value={unit} onChange={setUnit} options={unitOptions} placeholder="Any unit" searchable={false} />
            </View>
          </View>
        ) : null}
      </View>

      {loading ? (
        <LoadingView label="Loading attendance…" />
      ) : error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load attendance" message={error} tone="error" />
      ) : !grid?.employees?.length ? (
        <EmptyState icon={CalendarCheck} title="No employees found" message="Try a different company or unit." />
      ) : (
        <AttendanceGridView
          employees={grid.employees}
          attendance={grid.attendance || {}}
          daysInMonth={grid.days_in_month}
          yearMonth={yearMonth}
          onCellPress={handleCellPress}
        />
      )}

      <StatusPickerModal
        visible={Boolean(pendingCell)}
        current={pendingCell?.current}
        onClose={() => !saving && setPendingCell(null)}
        onSelect={applyStatus}
      />
      {saving ? (
        <View style={styles.savingOverlay}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerArea: { paddingHorizontal: 16, paddingTop: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { ...typography.h2 },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  uploadBtnText: { ...typography.caption, fontWeight: '700' },
  filterRow: { flexDirection: 'row', gap: 10 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  sheet: { width: '82%', borderRadius: 20, borderWidth: 1, padding: 18 },
  sheetTitle: { ...typography.h4, marginBottom: 12 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10 },
  optionText: { ...typography.body, fontWeight: '700' },
  savingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.05)' },
});
