import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Platform, Alert, ActivityIndicator } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Clock, AlertCircle, ChevronLeft, ChevronRight, Pencil, Trash2, Users, Square, CheckSquare } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography } from '../../theme';
import { api } from '../../services/api';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Fab } from '../../components/common/Fab';
import { FormInput } from '../../components/common/FormInput';
import { SelectField } from '../../components/common/SelectField';
import { SearchField } from '../../components/common/SearchField';
import { LoadingView } from '../../components/common/LoadingView';
import { EmptyState } from '../../components/common/EmptyState';
import { COMPANY_OPTIONS, getCompanyUnits } from '../../utils/companyConfig';

function parseTime(value) {
  const [h, m] = (value || '09:00').split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}
function toTimeString(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function formatTime12h(value) {
  if (!value) return '—';
  const [h, m] = value.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// No dedicated time-picker component exists in the app (DatePickerField is
// date-only) — this wraps the same native picker in `mode="time"`, scoped
// locally since only shift start/end times need it today.
function TimeField({ label, value, onChange }) {
  const { theme } = useTheme();
  const [iosOpen, setIosOpen] = useState(false);

  const open = () => {
    const current = parseTime(value);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'time',
        is24Hour: false,
        onChange: (event, selected) => {
          if (event.type === 'set' && selected) onChange(toTimeString(selected));
        },
      });
    } else {
      setIosOpen(true);
    }
  };

  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{label}</Text>
      <TouchableOpacity activeOpacity={0.7} onPress={open} style={[styles.timeField, { borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}>
        <Clock size={16} color={theme.textMuted} style={{ marginRight: 8 }} />
        <Text style={[styles.timeValue, { color: theme.textPrimary }]}>{formatTime12h(value)}</Text>
      </TouchableOpacity>
      {Platform.OS === 'ios' && iosOpen ? (
        <DateTimePicker
          value={parseTime(value)}
          mode="time"
          display="spinner"
          onChange={(event, selected) => {
            setIosOpen(false);
            if (event.type === 'set' && selected) onChange(toTimeString(selected));
          }}
        />
      ) : null}
    </View>
  );
}

function ShiftForm({ initial, onSaved, onCancel }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const isEdit = Boolean(initial?.id);
  const [form, setForm] = useState(() => ({
    name: initial?.name || '',
    company_code: initial?.company_code || user?.company_code || 'nidhi-impex',
    unit: initial?.unit || '',
    start_time: initial?.start_time || '09:00',
    end_time: initial?.end_time || '18:00',
    grace_minutes: initial?.grace_minutes != null ? String(initial.grace_minutes) : '',
    description: initial?.description || '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const unitOptions = useMemo(() => getCompanyUnits(form.company_code), [form.company_code]);
  const set = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    setError(null);
    if (!form.name.trim()) return setError('Enter a shift name.');
    setSaving(true);
    try {
      const payload = { ...form, grace_minutes: form.grace_minutes ? Number(form.grace_minutes) : null };
      const res = isEdit ? await api.updateShift(initial.id, payload) : await api.createShift(payload);
      if (res?.status) {
        onSaved();
      } else {
        setError(res?.message || 'Could not save this shift.');
      }
    } catch (e) {
      setError(e?.message || 'Could not save this shift.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <TouchableOpacity style={styles.backRow} onPress={onCancel} activeOpacity={0.7}>
        <ChevronLeft size={18} color={theme.primary} />
        <Text style={[styles.backText, { color: theme.primary }]}>Shifts</Text>
      </TouchableOpacity>
      <ScrollView contentContainerStyle={styles.formContent}>
        {error ? <Text style={[styles.errorText, { color: theme.rose }]}>{error}</Text> : null}
        <Card style={styles.sectionCard} elevated>
          <FormInput label="Shift Name" value={form.name} onChangeText={set('name')} placeholder="e.g. General Shift" />
          <SelectField label="Company" value={form.company_code} onChange={(v) => setForm((p) => ({ ...p, company_code: v, unit: '' }))} options={COMPANY_OPTIONS} searchable={false} />
          <SelectField label="Unit / Branch" value={form.unit} onChange={set('unit')} options={unitOptions} placeholder="Any unit" searchable={false} />
          <View style={styles.timeRow}>
            <View style={{ flex: 1 }}><TimeField label="Start Time" value={form.start_time} onChange={set('start_time')} /></View>
            <View style={{ flex: 1 }}><TimeField label="End Time" value={form.end_time} onChange={set('end_time')} /></View>
          </View>
          <FormInput label="Grace Period (minutes)" value={form.grace_minutes} onChangeText={set('grace_minutes')} keyboardType="number-pad" placeholder="0" />
          <FormInput label="Description" value={form.description} onChangeText={set('description')} multiline />
        </Card>
        <View style={styles.actionsRow}>
          <Button title="Cancel" variant="outline" onPress={onCancel} style={{ flex: 1 }} />
          <Button title={isEdit ? 'Save Changes' : 'Create Shift'} variant="gradient" onPress={submit} loading={saving} style={{ flex: 1 }} />
        </View>
      </ScrollView>
    </View>
  );
}

function AssignShift({ shift, onDone, onCancel }) {
  const { theme } = useTheme();
  const [search, setSearch] = useState('');
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = { limit: 200, company_code: shift.company_code };
        if (shift.unit) params.unit = shift.unit;
        const res = await api.getAdminEmployees(params);
        if (res?.status) setEmployees(res.data?.users?.data || []);
        else setError(res?.message || 'Could not load employees.');
      } catch (e) {
        setError(e?.message || 'Could not load employees.');
      } finally {
        setLoading(false);
      }
    })();
  }, [shift.company_code, shift.unit]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => [e.name, e.emp_code].filter(Boolean).some((f) => String(f).toLowerCase().includes(q)));
  }, [employees, search]);

  const toggle = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const confirmAssign = async () => {
    if (selectedIds.size === 0) return;
    setSaving(true);
    try {
      const res = await api.assignShift({ shift_id: shift.id, employee_ids: Array.from(selectedIds), company_code: shift.company_code });
      if (res?.status) {
        Alert.alert('Done', res.message || 'Employees assigned to this shift.');
        onDone();
      } else {
        Alert.alert('Could not assign', res?.message || 'Please try again.');
      }
    } catch (e) {
      Alert.alert('Could not assign', e?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <TouchableOpacity style={styles.backRow} onPress={onCancel} activeOpacity={0.7}>
        <ChevronLeft size={18} color={theme.primary} />
        <Text style={[styles.backText, { color: theme.primary }]}>Shifts</Text>
      </TouchableOpacity>
      <View style={styles.assignHeader}>
        <Text style={[styles.assignTitle, { color: theme.textPrimary }]}>Assign "{shift.name}"</Text>
        <SearchField value={search} onChangeText={setSearch} placeholder="Search employees…" />
      </View>

      {loading ? (
        <LoadingView label="Loading employees…" />
      ) : error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load employees" message={error} tone="error" />
      ) : (
        <ScrollView contentContainerStyle={styles.assignList}>
          {filtered.map((e) => {
            const selected = selectedIds.has(e.id);
            return (
              <TouchableOpacity key={e.id} style={styles.assignRow} onPress={() => toggle(e.id)} activeOpacity={0.7}>
                {selected ? <CheckSquare size={20} color={theme.primary} /> : <Square size={20} color={theme.textMuted} />}
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={[styles.assignName, { color: theme.textPrimary }]} numberOfLines={1}>{e.name}</Text>
                  <Text style={[styles.assignMeta, { color: theme.textMuted }]} numberOfLines={1}>{e.emp_code} · {e.shift_id === shift.id ? 'Currently on this shift' : e.department || '—'}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.assignFooter}>
        <Button
          title={`Assign ${selectedIds.size || ''} Employee${selectedIds.size === 1 ? '' : 's'}`.replace('  ', ' ')}
          variant="gradient"
          onPress={confirmAssign}
          loading={saving}
          disabled={selectedIds.size === 0}
        />
      </View>
    </View>
  );
}

export function AdminShiftsScreen({ onBack }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const canSwitchCompany = [0, 1].includes(Number(user?.role));
  const isUnitScoped = Number(user?.role) === 2;

  const [mode, setMode] = useState({ type: 'list' });
  const [companyFilter, setCompanyFilter] = useState(isUnitScoped ? user.company_code : COMPANY_OPTIONS[0].value);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const params = canSwitchCompany ? { company_code: companyFilter } : {};
      const res = await api.getShifts(params);
      if (res?.status) setShifts(res.data || []);
      else setError(res?.message || 'Could not load shifts.');
    } catch (e) {
      setError(e?.message || 'Could not load shifts.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canSwitchCompany, companyFilter]);

  useEffect(() => { load(); }, [load]);

  const confirmDelete = (shift) => {
    Alert.alert('Delete shift', `Delete "${shift.name}"? Employees on this shift will be unassigned.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(shift.id);
          try {
            const res = await api.deleteShift(shift.id);
            if (res?.status !== false) load(true);
            else Alert.alert('Could not delete', res?.message || 'Please try again.');
          } catch (e) {
            Alert.alert('Could not delete', e?.message || 'Please try again.');
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  };

  if (mode.type === 'form') {
    return <ShiftForm initial={mode.shift} onSaved={() => { setMode({ type: 'list' }); load(true); }} onCancel={() => setMode({ type: 'list' })} />;
  }
  if (mode.type === 'assign') {
    return <AssignShift shift={mode.shift} onDone={() => setMode({ type: 'list' })} onCancel={() => setMode({ type: 'list' })} />;
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.headerArea}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Shifts</Text>
        {canSwitchCompany ? (
          <SelectField value={companyFilter} onChange={setCompanyFilter} options={COMPANY_OPTIONS} searchable={false} />
        ) : null}
      </View>

      {loading ? (
        <LoadingView label="Loading shifts…" />
      ) : error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load shifts" message={error} tone="error" actionLabel="Retry" onAction={() => load()} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.primary} />}
        >
          {shifts.length === 0 ? (
            <EmptyState icon={Clock} title="No shifts yet" message="Create a shift to get started." />
          ) : (
            shifts.map((s) => (
              <Card key={s.id} style={styles.shiftCard} elevated>
                <View style={styles.shiftTop}>
                  <View style={[styles.shiftIconWrap, { backgroundColor: theme.violetBg }]}>
                    <Clock size={18} color={theme.violet} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.shiftName, { color: theme.textPrimary }]} numberOfLines={1}>{s.name}</Text>
                    <Text style={[styles.shiftMeta, { color: theme.textMuted }]}>
                      {formatTime12h(s.start_time)} – {formatTime12h(s.end_time)}
                      {s.grace_minutes ? ` · ${s.grace_minutes}m grace` : ''}
                    </Text>
                    <Text style={[styles.shiftMeta, { color: theme.textMuted }]}>
                      {[s.company_code, s.unit].filter(Boolean).join(' · ')} · {s.employees_count ?? 0} assigned
                    </Text>
                  </View>
                </View>
                <View style={styles.shiftActions}>
                  <TouchableOpacity style={styles.shiftActionBtn} onPress={() => setMode({ type: 'assign', shift: s })}>
                    <Users size={14} color={theme.primary} />
                    <Text style={[styles.shiftActionText, { color: theme.primary }]}>Assign</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.shiftActionBtn} onPress={() => setMode({ type: 'form', shift: s })}>
                    <Pencil size={14} color={theme.textMuted} />
                    <Text style={[styles.shiftActionText, { color: theme.textMuted }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.shiftActionBtn} onPress={() => confirmDelete(s)} disabled={deletingId === s.id}>
                    {deletingId === s.id ? <ActivityIndicator size="small" color={theme.rose} /> : <Trash2 size={14} color={theme.rose} />}
                    <Text style={[styles.shiftActionText, { color: theme.rose }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            ))
          )}
        </ScrollView>
      )}

      <Fab onPress={() => setMode({ type: 'form', shift: null })} accessibilityLabel="New shift" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerArea: { paddingHorizontal: 16, paddingTop: 16 },
  title: { ...typography.h2, marginBottom: 12 },
  listContent: { padding: 16, paddingBottom: 100 },
  shiftCard: { marginBottom: 12, padding: 16 },
  shiftTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  shiftIconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  shiftName: { ...typography.h4 },
  shiftMeta: { ...typography.caption, marginTop: 2 },
  shiftActions: {
    flexDirection: 'row', gap: 20, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(148,163,184,0.25)',
  },
  shiftActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  shiftActionText: { ...typography.caption, fontWeight: '700' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 16, marginBottom: 16, marginLeft: 16 },
  backText: { ...typography.body, fontWeight: '600' },
  formContent: { paddingHorizontal: 16, paddingBottom: 40 },
  errorText: { ...typography.caption, marginBottom: 8 },
  sectionCard: { marginBottom: 12 },
  timeRow: { flexDirection: 'row', gap: 10 },
  fieldWrap: { marginBottom: 14, flex: 1 },
  fieldLabel: { ...typography.caption, marginBottom: 6 },
  timeField: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 },
  timeValue: { fontSize: 14 },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  assignHeader: { paddingHorizontal: 16, marginBottom: 8 },
  assignTitle: { ...typography.h3, marginBottom: 12 },
  assignList: { paddingHorizontal: 16, paddingBottom: 100 },
  assignRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(148,163,184,0.2)' },
  assignName: { ...typography.body, fontWeight: '600' },
  assignMeta: { ...typography.caption, marginTop: 2 },
  assignFooter: { padding: 16, paddingBottom: 24 },
});
