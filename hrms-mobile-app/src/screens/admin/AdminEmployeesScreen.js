import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, RefreshControl, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import {
  Users, AlertCircle, ChevronLeft, ChevronRight, Building2, MapPin, Phone, Mail,
  Calendar, ShieldCheck, Landmark, Wallet, FileText, Pencil, Trash2, Filter, ArrowUpDown, Tag, Compact
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography, shadows } from '../../theme';
import { api } from '../../services/api';
import { Card } from '../../components/common/Card';
import { Avatar } from '../../components/common/Avatar';
import { Badge } from '../../components/common/Badge';
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

const COMPANY_FILTER_OPTIONS = [{ value: 'all', label: 'All Companies' }, ...COMPANY_OPTIONS];
const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'pending', label: 'Pending' },
  { value: 'resigned', label: 'Resigned' },
];
const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Name (A - Z)' },
  { value: 'name_desc', label: 'Name (Z - A)' },
  { value: 'code_asc', label: 'Emp Code (Low to High)' },
  { value: 'code_desc', label: 'Emp Code (High to Low)' },
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

function EmployeeCardItem({ employee, onPress, onLongPress, selectionMode }) {
  const { theme } = useTheme();
  const status = employeeStatus(employee);

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} onLongPress={onLongPress} style={styles.cardWrap}>
      <Card style={styles.employeeCard} elevated>
        <View style={styles.cardHeader}>
          <Avatar name={employee.name} uri={employee.photo} size={48} />
          
          <View style={styles.cardMainInfo}>
            <View style={styles.cardTitleRow}>
              <Text style={[styles.empName, { color: theme.textPrimary }]} numberOfLines={1}>
                {employee.name || '—'}
              </Text>
              <Badge label={status.label} variant={status.variant} size="small" />
            </View>

            <View style={styles.cardTagRow}>
              {employee.emp_code ? (
                <View style={[styles.codeBadge, { backgroundColor: theme.primary + '12' }]}>
                  <Text style={[styles.codeText, { color: theme.primary }]}>ID {employee.emp_code}</Text>
                </View>
              ) : null}

              {employee.department ? (
                <Text style={[styles.deptText, { color: theme.textMuted }]} numberOfLines={1}>
                  {employee.department}
                </Text>
              ) : null}
            </View>

            <View style={styles.cardMetaRow}>
              <Building2 size={12} color={theme.textMuted} />
              <Text style={[styles.metaText, { color: theme.textMuted }]} numberOfLines={1}>
                {employee.company_code || '—'}{employee.unit ? ` · ${employee.unit}` : ''}
              </Text>
            </View>
          </View>

          {!selectionMode ? <ChevronRight size={18} color={theme.textMuted} style={{ marginLeft: 4 }} /> : null}
        </View>
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
    <ScrollView contentContainerStyle={styles.detailContent}>
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
        <Button label="Cancel" variant="outline" onPress={onCancel} style={{ flex: 1 }} />
        <Button label="Save Changes" loading={saving} onPress={save} style={{ flex: 1 }} />
      </View>
    </ScrollView>
  );
}

function EmployeeDetailView({ employeeId, onBack, onDeleted }) {
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
            const res = await api.deleteAdminEmployee(employee.id);
            if (res?.status !== false) {
              onDeleted(employee.id);
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
          <Text style={[styles.backText, { color: theme.primary }]}>Cancel Editing</Text>
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
        <Text style={[styles.backText, { color: theme.primary }]}>Back to Employees</Text>
      </TouchableOpacity>

      {loading ? (
        <LoadingView label="Loading employee…" />
      ) : error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load employee" message={error} tone="error" />
      ) : (
        <ScrollView contentContainerStyle={styles.detailContent}>
          <Card style={styles.heroCard} elevated>
            <Avatar name={employee.name} uri={employee.photo} size={76} />
            <Text style={[styles.heroName, { color: theme.textPrimary }]}>{employee.name || '—'}</Text>
            <Text style={[styles.heroMeta, { color: theme.textMuted }]}>
              {employee.designation || '—'}{employee.department ? ` · ${employee.department}` : ''}
            </Text>
            <View style={styles.heroBadgeRow}>
              <Badge label={employeeStatus(employee).label} variant={employeeStatus(employee).variant} />
              {employee.emp_code ? <Badge label={`ID ${employee.emp_code}`} variant="primary" /> : null}
            </View>

            <View style={styles.heroActionsRow}>
              {can('hr.employee.update') ? (
                <TouchableOpacity style={[styles.heroActionBtn, { backgroundColor: theme.primary + '12' }]} onPress={() => setEditing(true)}>
                  <Pencil size={15} color={theme.primary} />
                  <Text style={[styles.heroActionText, { color: theme.primary }]}>Edit Profile</Text>
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
        </ScrollView>
      )}
    </View>
  );
}

const PAGE_SIZE = 20;

export function AdminEmployeesScreen() {
  const { theme } = useTheme();
  const { user, can } = useAuth();
  const departmentOptions = useDepartmentOptions();
  const canSwitchCompany = [0, 1].includes(Number(user?.role));

  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');
  const [employees, setEmployees] = useState([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const requestId = useRef(0);

  const deptSelectOptions = useMemo(() => {
    const list = Array.isArray(departmentOptions) ? departmentOptions : [];
    return [{ value: '', label: 'All Departments' }, ...list];
  }, [departmentOptions]);

  const fetchPage = useCallback(async (targetPage = 1, { append = false, isRefresh = false } = {}) => {
    const myRequest = ++requestId.current;
    if (append) setLoadingMore(true);
    else if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setError(null);
    try {
      const params = {
        page: targetPage,
        per_page: PAGE_SIZE,
        search: search.trim() || undefined,
        status: statusFilter !== '' ? statusFilter : undefined,
        department: deptFilter || undefined,
        company_code: canSwitchCompany && companyFilter !== 'all' ? companyFilter : undefined,
      };

      const res = await api.getAdminEmployees(params);
      if (myRequest !== requestId.current) return;

      if (res?.status !== false && res) {
        const rawList =
          Array.isArray(res.data?.users?.data) ? res.data.users.data :
          Array.isArray(res.data?.users) ? res.data.users :
          Array.isArray(res.users?.data) ? res.users.data :
          Array.isArray(res.users) ? res.users :
          Array.isArray(res.data?.data) ? res.data.data :
          Array.isArray(res.data) ? res.data :
          Array.isArray(res) ? res : [];

        const total =
          res.total ??
          res.data?.users?.total ??
          res.data?.total ??
          res.users?.total ??
          rawList.length;

        const currentP =
          res.current_page ??
          res.data?.users?.current_page ??
          res.data?.current_page ??
          res.users?.current_page ??
          targetPage;

        const lastP =
          res.last_page ??
          res.data?.users?.last_page ??
          res.data?.last_page ??
          res.users?.last_page ??
          targetPage;

        setTotalCount(total);
        setPage(currentP);
        setLastPage(lastP);
        setEmployees((prev) => (append ? [...(Array.isArray(prev) ? prev : []), ...rawList] : rawList));
      } else {
        setError(res?.message || 'Could not load employees.');
      }
    } catch (e) {
      if (myRequest === requestId.current) {
        setError(e?.message || 'Could not load employees.');
      }
    } finally {
      if (myRequest === requestId.current) {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    }
  }, [search, statusFilter, deptFilter, companyFilter, canSwitchCompany]);

  useEffect(() => {
    const t = setTimeout(() => fetchPage(1), 350);
    return () => clearTimeout(t);
  }, [search, statusFilter, deptFilter, companyFilter]);

  const sortedEmployees = useMemo(() => {
    if (!Array.isArray(employees)) return [];
    const list = [...employees];
    if (sortBy === 'name_asc') {
      return list.sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
    }
    if (sortBy === 'name_desc') {
      return list.sort((a, b) => (b?.name || '').localeCompare(a?.name || ''));
    }
    if (sortBy === 'code_asc') {
      return list.sort((a, b) => (Number(a?.emp_code) || 0) - (Number(b?.emp_code) || 0));
    }
    if (sortBy === 'code_desc') {
      return list.sort((a, b) => (Number(b?.emp_code) || 0) - (Number(a?.emp_code) || 0));
    }
    return list;
  }, [employees, sortBy]);

  const loadMore = () => {
    if (loadingMore || loading || page >= lastPage) return;
    fetchPage(page + 1, { append: true });
  };

  const handleBulkDelete = async (selectedIds) => {
    setBulkDeleting(true);
    try {
      const res = await api.bulkDeleteEmployees(selectedIds);
      if (res?.status !== false) {
        setEmployees((prev) => prev.filter((e) => !selectedIds.includes(e.id)));
      } else {
        Alert.alert('Could not delete', res?.message || 'Please try again.');
      }
    } catch (e) {
      Alert.alert('Could not delete', e?.message || 'Please try again.');
    } finally {
      setBulkDeleting(false);
    }
  };

  if (selectedId) {
    return (
      <EmployeeDetailView
        employeeId={selectedId}
        onBack={() => setSelectedId(null)}
        onDeleted={(id) => { setSelectedId(null); setEmployees((prev) => prev.filter((e) => e.id !== id)); }}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* Header & Quick Utility Filters */}
      <View style={styles.headerArea}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Employees Directory</Text>
          <Badge label={`${totalCount || sortedEmployees.length} Total`} variant="primary" />
        </View>

        <SearchField value={search} onChangeText={setSearch} placeholder="Search by name, code, mobile, department…" style={styles.search} />

        {/* Status Pill Utility Bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillBar}>
          {[
            { label: 'All', value: '' },
            { label: 'Active', value: 'active' },
            { label: 'Inactive', value: 'inactive' },
            { label: 'Pending', value: 'pending' },
            { label: 'Resigned', value: 'resigned' },
          ].map((pill) => {
            const isActive = statusFilter === pill.value;
            return (
              <TouchableOpacity
                key={pill.label}
                onPress={() => setStatusFilter(pill.value)}
                style={[
                  styles.pill,
                  { backgroundColor: isActive ? theme.primary : theme.surfaceElevated, borderColor: isActive ? theme.primary : theme.border },
                ]}
                activeOpacity={0.8}
              >
                <Text style={[styles.pillText, { color: isActive ? '#FFFFFF' : theme.textMuted }]}>{pill.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Main List */}
      {loading ? (
        <LoadingView label="Loading employees directory…" />
      ) : error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load employees" message={error} tone="error" actionLabel="Retry" onAction={() => fetchPage(1)} />
      ) : (
        <BulkSelectList
          data={sortedEmployees}
          keyExtractor={(item) => String(item.id)}
          renderItem={(item, isSelected, toggle, isSelecting) => (
            <EmployeeCardItem
              employee={item}
              selectionMode={isSelecting}
              onPress={() => (isSelecting ? toggle(item.id) : setSelectedId(item.id))}
              onLongPress={() => toggle(item.id)}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchPage(1, { isRefresh: true })} tintColor={theme.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
          ListEmptyComponent={<EmptyState icon={Users} title="No employees found" message="Try adjusting your search or filters." />}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color={theme.primary} /> : null}
          bulkActions={
            can('hr.employee.delete')
              ? [
                  {
                    key: 'delete',
                    label: 'Delete',
                    icon: Trash2,
                    variant: 'destructive',
                    loading: bulkDeleting,
                    onPress: (ids) => {
                      Alert.alert('Delete employees', `Delete ${ids.length} selected employee(s)? This cannot be undone.`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => handleBulkDelete(ids) },
                      ]);
                    },
                  },
                ]
              : []
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerArea: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { ...typography.h3, fontWeight: '800' },
  search: { marginBottom: 10 },
  pillBar: { flexDirection: 'row', gap: 6, paddingBottom: 10 },
  pill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  pillText: { ...typography.micro, fontWeight: '700' },
  filterGrid: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 110 },
  cardWrap: { marginBottom: 10 },
  employeeCard: { padding: 12, borderRadius: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  cardMainInfo: { flex: 1, marginLeft: 12 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  empName: { ...typography.body, fontWeight: '700', flex: 1, marginRight: 8 },
  cardTagRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  codeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  codeText: { ...typography.micro, fontWeight: '700' },
  deptText: { ...typography.caption, fontWeight: '600' },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { ...typography.micro },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 14, marginBottom: 10, marginHorizontal: 16 },
  backText: { ...typography.body, fontWeight: '600' },
  detailContent: { paddingHorizontal: 16, paddingBottom: 110 },
  errorText: { ...typography.caption, marginBottom: 8 },
  heroCard: { alignItems: 'center', padding: 20, marginBottom: 12, borderRadius: 20 },
  heroName: { ...typography.h3, fontWeight: '800', marginTop: 10 },
  heroMeta: { ...typography.body, marginTop: 2 },
  heroBadgeRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  heroActionsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  heroActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12 },
  heroActionText: { ...typography.caption, fontWeight: '700' },
  infoCard: { padding: 4, borderRadius: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12 },
  infoIconWrap: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { ...typography.caption },
  infoValue: { ...typography.body, fontWeight: '600', marginTop: 2 },
  sectionCard: { marginBottom: 12, padding: 16, borderRadius: 16 },
  sectionTitle: { ...typography.h4, marginBottom: 14 },
  editActionsRow: { flexDirection: 'row', gap: 10, marginTop: 6, marginBottom: 40 },
});
