import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import {
  Users, AlertCircle, ChevronLeft, ChevronRight, Building2, MapPin, Phone, Mail,
  Calendar, ShieldCheck, Landmark, Wallet, FileText, Pencil, Trash2,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography } from '../../theme';
import { api } from '../../services/api';
import { Card } from '../../components/common/Card';
import { Avatar } from '../../components/common/Avatar';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Fab } from '../../components/common/Fab';
import { SearchField } from '../../components/common/SearchField';
import { SelectField } from '../../components/common/SelectField';
import { FormInput } from '../../components/common/FormInput';
import { FormSelect } from '../../components/common/FormSelect';
import { DatePickerField } from '../../components/common/DatePickerField';
import { LoadingView } from '../../components/common/LoadingView';
import { EmptyState } from '../../components/common/EmptyState';
import { BulkSelectList } from '../../components/admin/BulkSelectList';
import { formatDate } from '../../utils/format';
import { COMPANY_OPTIONS } from '../../utils/companyConfig';
import { useDepartmentOptions } from '../../hooks/useDepartmentOptions';
import { AddEmployeeScreen } from './AddEmployeeScreen';

const COMPANY_FILTER_OPTIONS = [{ value: 'all', label: 'All Companies' }, ...COMPANY_OPTIONS];
const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'pending', label: 'Pending' },
  { value: 'resigned', label: 'Resigned' },
];
const GENDER_OPTIONS = ['MALE', 'FEMALE', 'OTHER'];
const ACCOUNT_STATUS_OPTIONS = [{ value: '0', label: 'Active' }, { value: '1', label: 'Inactive' }];

function employeeStatus(emp) {
  if (emp.resignation_date && new Date(emp.resignation_date) <= new Date()) {
    return { label: 'Resigned', variant: 'rose' };
  }
  const status = String(emp.status);
  if (status === '2') return { label: 'Pending', variant: 'amber' };
  if (status === '1') return { label: 'Inactive', variant: 'rose' };
  return { label: 'Active', variant: 'emerald' };
}

function EmployeeRow({ employee, onPress, onLongPress, selectionMode }) {
  const { theme } = useTheme();
  const status = employeeStatus(employee);
  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress} onLongPress={onLongPress}>
      <Card style={styles.row} elevated>
        <Avatar name={employee.name} uri={employee.photo} size={44} />
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={[styles.rowName, { color: theme.textPrimary }]} numberOfLines={1}>{employee.name || '—'}</Text>
            <Badge label={status.label} variant={status.variant} size="small" />
          </View>
          <Text style={[styles.rowMeta, { color: theme.textMuted }]} numberOfLines={1}>
            {employee.emp_code ? `${employee.emp_code} · ` : ''}{employee.department || '—'}
          </Text>
          <Text style={[styles.rowMeta, { color: theme.textMuted }]} numberOfLines={1}>
            {employee.company_code || ''}{employee.unit ? ` · ${employee.unit}` : ''}
          </Text>
        </View>
        {!selectionMode ? <ChevronRight size={18} color={theme.textMuted} /> : null}
      </Card>
    </TouchableOpacity>
  );
}

function InfoRow({ icon: Icon, label, value, theme, last }) {
  return (
    <View style={[styles.infoRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
      <View style={[styles.infoIconWrap, { backgroundColor: theme.primary + '12' }]}>
        <Icon size={15} color={theme.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: theme.textPrimary }]}>{value || '—'}</Text>
      </View>
    </View>
  );
}

function buildEditForm(employee) {
  return {
    name: employee?.name || '',
    designation: employee?.designation || '',
    department: employee?.department || '',
    gender: (employee?.gender || '').toUpperCase(),
    dob: employee?.dob || '',
    mobile_number: employee?.mobile_number || '',
    email: employee?.email || '',
    joining_date: employee?.joining_date || '',
    status: employee?.status != null ? String(employee.status) : '0',
    address: employee?.address || '',
    city: employee?.city || '',
    district: employee?.district || '',
    state: employee?.state || '',
    pin: employee?.pin || '',
    pan_card_no: employee?.pan_card_no || '',
    bank_name: employee?.bank_name || '',
    bank_ifsc_code: employee?.bank_ifsc_code || '',
    bank_account_no: employee?.bank_account_no || '',
    pf_no: employee?.pf_no || '',
    esi_no: employee?.esi_no || '',
  };
}

function EmployeeEditForm({ employee, onSaved, onCancel }) {
  const { theme } = useTheme();
  const departmentOptions = useDepartmentOptions();
  const [form, setForm] = useState(() => buildEditForm(employee));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateEmployee(employee.id, form);
      if (res?.status) {
        onSaved(res.data || { ...employee, ...form });
      } else {
        setError(res?.message || 'Could not save changes.');
      }
    } catch (e) {
      setError(e?.message || 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.detailContent}>
      {error ? <Text style={[styles.errorText, { color: theme.rose }]}>{error}</Text> : null}

      <Card style={styles.sectionCard} elevated>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Basic Details</Text>
        <FormInput label="Full Name" value={form.name} onChangeText={set('name')} />
        <SelectField label="Department" value={form.department} onChange={set('department')} options={departmentOptions} />
        <FormInput label="Designation" value={form.designation} onChangeText={set('designation')} />
        <FormSelect label="Gender" value={form.gender} onChange={set('gender')} options={GENDER_OPTIONS} />
        <DatePickerField label="Date of Birth" value={form.dob} onChange={set('dob')} />
      </Card>

      <Card style={styles.sectionCard} elevated>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Contact & Employment</Text>
        <FormInput label="Mobile Number" value={form.mobile_number} onChangeText={set('mobile_number')} keyboardType="phone-pad" />
        <FormInput label="Email" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
        <DatePickerField label="Joining Date" value={form.joining_date} onChange={set('joining_date')} />
        <FormSelect label="Status" value={form.status} onChange={set('status')} options={ACCOUNT_STATUS_OPTIONS} />
      </Card>

      <Card style={styles.sectionCard} elevated>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Address</Text>
        <FormInput label="Full Address" value={form.address} onChangeText={set('address')} multiline />
        <FormInput label="City" value={form.city} onChangeText={set('city')} />
        <FormInput label="District" value={form.district} onChangeText={set('district')} />
        <FormInput label="State" value={form.state} onChangeText={set('state')} />
        <FormInput label="PIN Code" value={form.pin} onChangeText={set('pin')} keyboardType="number-pad" />
      </Card>

      <Card style={styles.sectionCard} elevated>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Bank & ID</Text>
        <FormInput label="PAN Card No" value={form.pan_card_no} onChangeText={set('pan_card_no')} autoCapitalize="characters" />
        <FormInput label="Bank Name" value={form.bank_name} onChangeText={set('bank_name')} />
        <FormInput label="Bank IFSC" value={form.bank_ifsc_code} onChangeText={set('bank_ifsc_code')} autoCapitalize="characters" />
        <FormInput label="Bank Account No" value={form.bank_account_no} onChangeText={set('bank_account_no')} keyboardType="number-pad" />
        <FormInput label="PF Account No" value={form.pf_no} onChangeText={set('pf_no')} />
        <FormInput label="ESI ID No" value={form.esi_no} onChangeText={set('esi_no')} />
      </Card>

      <View style={styles.editActionsRow}>
        <Button title="Cancel" variant="outline" onPress={onCancel} style={{ flex: 1 }} />
        <Button title="Save Changes" variant="gradient" onPress={save} loading={saving} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

function EmployeeDetail({ employeeId, onBack, onDeleted }) {
  const { theme } = useTheme();
  const { can } = useAuth();
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getAdminEmployee(employeeId);
        if (cancelled) return;
        if (res?.status) setEmployee(res.data);
        else setError(res?.message || 'Could not load this employee.');
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Could not load this employee.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [employeeId]);

  const confirmDelete = () => {
    Alert.alert('Delete employee', `Remove ${employee?.name || 'this employee'}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            const res = await api.deleteEmployee(employeeId);
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

  if (editing && employee) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        <TouchableOpacity style={styles.backRow} onPress={() => setEditing(false)} activeOpacity={0.7}>
          <ChevronLeft size={18} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary }]}>Cancel Edit</Text>
        </TouchableOpacity>
        <EmployeeEditForm
          employee={employee}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => { setEmployee((prev) => ({ ...prev, ...updated })); setEditing(false); }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <TouchableOpacity style={styles.backRow} onPress={onBack} activeOpacity={0.7}>
        <ChevronLeft size={18} color={theme.primary} />
        <Text style={[styles.backText, { color: theme.primary }]}>Employees</Text>
      </TouchableOpacity>

      {loading ? (
        <LoadingView label="Loading employee…" />
      ) : error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load employee" message={error} tone="error" />
      ) : (
        <View style={styles.detailContent}>
          <Card style={styles.heroCard} elevated>
            <Avatar name={employee.name} uri={employee.photo} size={72} />
            <Text style={[styles.heroName, { color: theme.textPrimary }]}>{employee.name || '—'}</Text>
            <Text style={[styles.heroMeta, { color: theme.textMuted }]}>
              {employee.designation || '—'}{employee.department ? ` · ${employee.department}` : ''}
            </Text>
            <View style={styles.heroBadgeRow}>
              <Badge label={employeeStatus(employee).label} variant={employeeStatus(employee).variant} />
              {employee.emp_code ? <Badge label={`ID ${employee.emp_code}`} variant="default" /> : null}
            </View>

            <View style={styles.heroActionsRow}>
              {can('hr.employee.update') ? (
                <TouchableOpacity style={[styles.heroActionBtn, { backgroundColor: theme.primary + '12' }]} onPress={() => setEditing(true)}>
                  <Pencil size={15} color={theme.primary} />
                  <Text style={[styles.heroActionText, { color: theme.primary }]}>Edit</Text>
                </TouchableOpacity>
              ) : null}
              {can('hr.employee.delete') ? (
                <TouchableOpacity style={[styles.heroActionBtn, { backgroundColor: theme.roseBg }]} onPress={confirmDelete} disabled={deleting}>
                  {deleting ? <ActivityIndicator size="small" color={theme.rose} /> : <Trash2 size={15} color={theme.rose} />}
                  <Text style={[styles.heroActionText, { color: theme.rose }]}>Delete</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </Card>

          <Card style={styles.infoCard} elevated>
            <InfoRow icon={Building2} label="Company" value={employee.company_code} theme={theme} />
            <InfoRow icon={MapPin} label="Unit / Branch" value={employee.unit} theme={theme} />
            <InfoRow icon={Phone} label="Mobile Number" value={employee.mobile_number} theme={theme} />
            <InfoRow icon={Mail} label="Email" value={employee.email} theme={theme} />
            <InfoRow icon={Calendar} label="Joining Date" value={employee.joining_date ? formatDate(employee.joining_date) : null} theme={theme} />
            <InfoRow
              icon={Calendar}
              label="Resignation Date"
              value={employee.resignation_date ? formatDate(employee.resignation_date) : null}
              theme={theme}
              last={!employee.aadhaar_full && !employee.bank_name}
            />
            {employee.aadhaar_full ? (
              <InfoRow icon={ShieldCheck} label="Aadhaar Number" value={employee.aadhaar_full} theme={theme} last={!employee.bank_name} />
            ) : null}
            {employee.bank_name ? (
              <>
                <InfoRow icon={Landmark} label="Bank Name" value={employee.bank_name} theme={theme} />
                <InfoRow icon={Landmark} label="IFSC Code" value={employee.bank_ifsc_code} theme={theme} />
                <InfoRow icon={Wallet} label="Account Number" value={employee.bank_account_no} theme={theme} />
                <InfoRow icon={FileText} label="PF Number" value={employee.pf_no} theme={theme} />
                <InfoRow icon={FileText} label="ESI Number" value={employee.esi_no} theme={theme} last />
              </>
            ) : null}
          </Card>
        </View>
      )}
    </View>
  );
}

const PAGE_SIZE = 20;

export function AdminEmployeesScreen() {
  const { theme } = useTheme();
  const { user, can } = useAuth();
  const canSwitchCompany = [0, 1].includes(Number(user?.role));

  const [mode, setMode] = useState('list'); // 'list' | 'detail' | 'create'
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('');
  const [employees, setEmployees] = useState([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const requestId = useRef(0);

  const fetchPage = useCallback(async (pageNum, { append = false, isRefresh = false } = {}) => {
    const myRequest = ++requestId.current;
    if (isRefresh) setRefreshing(true);
    else if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const params = { limit: PAGE_SIZE, page: pageNum };
      if (search.trim()) params.search = search.trim();
      if (canSwitchCompany) params.company_code = companyFilter;
      if (statusFilter) params.status = statusFilter;
      const res = await api.getAdminEmployees(params);
      if (myRequest !== requestId.current) return;
      if (res?.status) {
        const list = res.data?.users?.data || [];
        setEmployees((prev) => (append ? [...prev, ...list] : list));
        setPage(res.data?.users?.current_page || pageNum);
        setLastPage(res.data?.users?.last_page || pageNum);
      } else {
        setError(res?.message || 'Could not load employees.');
      }
    } catch (e) {
      if (myRequest === requestId.current) setError(e?.message || 'Could not load employees.');
    } finally {
      if (myRequest === requestId.current) {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    }
  }, [search, companyFilter, statusFilter, canSwitchCompany]);

  useEffect(() => {
    if (mode !== 'list') return;
    const t = setTimeout(() => fetchPage(1), 350);
    return () => clearTimeout(t);
  }, [search, companyFilter, statusFilter, mode]);

  const loadMore = () => {
    if (loadingMore || loading || page >= lastPage) return;
    fetchPage(page + 1, { append: true });
  };

  const bulkDelete = (ids, { clearSelection }) => {
    Alert.alert('Delete employees', `Remove ${ids.length} employee${ids.length === 1 ? '' : 's'}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBulkDeleting(true);
          try {
            const res = await api.deleteEmployeesBulk(ids);
            if (res?.status !== false) {
              clearSelection();
              fetchPage(1);
            } else {
              Alert.alert('Could not delete', res?.message || 'Please try again.');
            }
          } catch (e) {
            Alert.alert('Could not delete', e?.message || 'Please try again.');
          } finally {
            setBulkDeleting(false);
          }
        },
      },
    ]);
  };

  if (mode === 'create') {
    return (
      <AddEmployeeScreen
        onDone={() => { setMode('list'); fetchPage(1); }}
        onCancel={() => setMode('list')}
      />
    );
  }

  if (selectedId) {
    return (
      <EmployeeDetail
        employeeId={selectedId}
        onBack={() => setSelectedId(null)}
        onDeleted={() => { setSelectedId(null); fetchPage(1); }}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.headerArea}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Employees</Text>
        <SearchField value={search} onChangeText={setSearch} placeholder="Search name, code, email…" />
        <View style={styles.filterRow}>
          {canSwitchCompany ? (
            <View style={{ flex: 1 }}>
              <SelectField value={companyFilter} onChange={setCompanyFilter} options={COMPANY_FILTER_OPTIONS} searchable={false} />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <SelectField value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} searchable={false} />
          </View>
        </View>
      </View>

      {loading ? (
        <LoadingView label="Loading employees…" />
      ) : error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load employees" message={error} tone="error" actionLabel="Retry" onAction={() => fetchPage(1)} />
      ) : (
        <BulkSelectList
          data={employees}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchPage(1, { isRefresh: true })} tintColor={theme.primary} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          emptyComponent={<EmptyState icon={Users} title="No employees found" message="Try a different search or filter." />}
          footerComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color={theme.primary} /> : null}
          renderRow={(employee, { selectionMode, toggle, enterSelection }) => (
            <EmployeeRow
              employee={employee}
              selectionMode={selectionMode}
              onPress={() => (selectionMode ? toggle() : setSelectedId(employee.id))}
              onLongPress={enterSelection}
            />
          )}
          renderBulkActions={(ids, helpers) => (
            can('hr.employee.delete') ? (
              <TouchableOpacity
                style={[styles.bulkDeleteBtn, { backgroundColor: theme.roseBg }]}
                onPress={() => bulkDelete(ids, helpers)}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? <ActivityIndicator size="small" color={theme.rose} /> : <Trash2 size={16} color={theme.rose} />}
                <Text style={[styles.bulkDeleteText, { color: theme.rose }]}>Delete</Text>
              </TouchableOpacity>
            ) : null
          )}
        />
      )}

      {can('hr.employee.create') ? <Fab onPress={() => setMode('create')} accessibilityLabel="Add employee" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerArea: { paddingHorizontal: 16, paddingTop: 50 },
  title: { ...typography.h2, marginBottom: 12 },
  filterRow: { flexDirection: 'row', gap: 10 },
  listContent: { paddingTop: 12, paddingBottom: 100 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 5, marginHorizontal: 16 },
  rowBody: { flex: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  rowName: { ...typography.body, fontWeight: '700', flexShrink: 1, marginRight: 8 },
  rowMeta: { ...typography.caption },
  bulkDeleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  bulkDeleteText: { ...typography.caption, fontWeight: '700' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 20, marginLeft: 16, marginTop: 50 },
  backText: { ...typography.body, fontWeight: '600' },
  detailContent: { paddingHorizontal: 16, paddingBottom: 40 },
  errorText: { ...typography.caption, marginBottom: 8 },
  heroCard: { alignItems: 'center', padding: 20, marginBottom: 12 },
  heroName: { ...typography.h3, marginTop: 10 },
  heroMeta: { ...typography.body, marginTop: 2 },
  heroBadgeRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  heroActionsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  heroActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12 },
  heroActionText: { ...typography.caption, fontWeight: '700' },
  infoCard: { padding: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12 },
  infoIconWrap: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { ...typography.caption },
  infoValue: { ...typography.body, fontWeight: '600', marginTop: 2 },
  sectionCard: { marginBottom: 12 },
  sectionTitle: { ...typography.h4, marginBottom: 14 },
  editActionsRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
});
