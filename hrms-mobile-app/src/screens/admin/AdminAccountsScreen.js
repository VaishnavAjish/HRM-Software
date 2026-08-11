import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { ShieldCheck, AlertCircle, ChevronLeft } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography } from '../../theme';
import { api, ApiError } from '../../services/api';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Fab } from '../../components/common/Fab';
import { FormInput } from '../../components/common/FormInput';
import { FormSelect } from '../../components/common/FormSelect';
import { SelectField } from '../../components/common/SelectField';
import { SearchField } from '../../components/common/SearchField';
import { LoadingView } from '../../components/common/LoadingView';
import { EmptyState } from '../../components/common/EmptyState';
import { COMPANY_OPTIONS } from '../../utils/companyConfig';

const ROLE_LABEL = { '0': 'Super Admin', '1': 'Admin', 0: 'Super Admin', 1: 'Admin' };
const ROLE_VARIANT = { '0': 'rose', '1': 'primary', 0: 'rose', 1: 'primary' };

function CreateAdminForm({ isSuperAdmin, onDone, onCancel }) {
  const { theme } = useTheme();
  const roleOptions = isSuperAdmin
    ? [{ value: '1', label: 'Admin' }, { value: '0', label: 'Super Admin' }]
    : [{ value: '1', label: 'Admin' }];
  const [form, setForm] = useState({ name: '', email: '', password: '', role: '1', company_code: COMPANY_OPTIONS[0].value });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const set = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    setError(null);
    if (!form.name.trim()) return setError('Enter a name.');
    if (!form.email.trim()) return setError('Enter an email address.');
    if (form.password.length < 6) return setError('Password must be at least 6 characters.');
    setSubmitting(true);
    try {
      const res = await api.createAdminAccount(form);
      if (res?.status) {
        onDone();
      } else {
        setError(res?.message || 'Could not create this account.');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create this account.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <TouchableOpacity style={styles.backRow} onPress={onCancel} activeOpacity={0.7}>
        <ChevronLeft size={18} color={theme.primary} />
        <Text style={[styles.backText, { color: theme.primary }]}>Manage Admins</Text>
      </TouchableOpacity>
      <ScrollView contentContainerStyle={styles.formContent}>
        {error ? <Text style={[styles.errorText, { color: theme.rose }]}>{error}</Text> : null}
        <Card style={styles.sectionCard} elevated>
          <FormInput label="Full Name" value={form.name} onChangeText={set('name')} />
          <FormInput label="Email" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
          <FormInput label="Password" value={form.password} onChangeText={set('password')} secureTextEntry placeholder="At least 6 characters" />
          <FormSelect label="Role" value={form.role} onChange={set('role')} options={roleOptions} />
          <SelectField label="Company" value={form.company_code} onChange={set('company_code')} options={COMPANY_OPTIONS} searchable={false} />
        </Card>
        <View style={styles.actionsRow}>
          <Button title="Cancel" variant="outline" onPress={onCancel} style={{ flex: 1 }} />
          <Button title="Create Account" variant="gradient" onPress={submit} loading={submitting} style={{ flex: 1 }} />
        </View>
      </ScrollView>
    </View>
  );
}

export function AdminAccountsScreen({ onBack }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const isSuperAdmin = Number(user?.role) === 0;

  const [accounts, setAccounts] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const params = { role: '0,1', limit: 50 };
      if (search.trim()) params.search = search.trim();
      const res = await api.getAdminAccounts(params);
      if (res?.status) setAccounts(res.data || []);
      else setError(res?.message || 'Could not load admin accounts.');
    } catch (e) {
      setError(e?.message || 'Could not load admin accounts.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => load(), 350);
    return () => clearTimeout(t);
  }, [search]);

  if (!isSuperAdmin) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        {onBack ? (
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4, margin: 16 }} onPress={onBack} activeOpacity={0.7}>
            <ChevronLeft size={18} color={theme.primary} />
            <Text style={{ ...typography.body, fontWeight: '600', color: theme.primary }}>Back to Profile</Text>
          </TouchableOpacity>
        ) : null}
        <EmptyState icon={ShieldCheck} title="Super Admin only" message="Only a Super Admin account can manage other admin accounts." />
      </View>
    );
  }

  if (creating) {
    return <CreateAdminForm isSuperAdmin={isSuperAdmin} onDone={() => { setCreating(false); load(true); }} onCancel={() => setCreating(false)} />;
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.headerArea}>
        {onBack ? (
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }} onPress={onBack} activeOpacity={0.7}>
            <ChevronLeft size={18} color={theme.primary} />
            <Text style={{ ...typography.body, fontWeight: '600', color: theme.primary }}>Back to Profile</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={[styles.title, { color: theme.textPrimary }]}>Manage Admins</Text>
        <SearchField value={search} onChangeText={setSearch} placeholder="Search name, email, code…" />
      </View>

      {loading ? (
        <LoadingView label="Loading admin accounts…" />
      ) : error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load accounts" message={error} tone="error" actionLabel="Retry" onAction={() => load()} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.primary} />}
        >
          {accounts.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="No admin accounts found" />
          ) : (
            accounts.map((a) => (
              <Card key={a.id} style={styles.row} elevated>
                <View style={styles.rowTop}>
                  <Text style={[styles.rowName, { color: theme.textPrimary }]} numberOfLines={1}>{a.name}</Text>
                  <Badge label={ROLE_LABEL[a.role] || 'Admin'} variant={ROLE_VARIANT[a.role] || 'primary'} size="small" />
                </View>
                <Text style={[styles.rowMeta, { color: theme.textMuted }]} numberOfLines={1}>{a.email}</Text>
                <Text style={[styles.rowMeta, { color: theme.textMuted }]} numberOfLines={1}>{a.company_code || 'All companies'}</Text>
              </Card>
            ))
          )}
        </ScrollView>
      )}

      <Fab onPress={() => setCreating(true)} accessibilityLabel="Create admin account" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerArea: { paddingHorizontal: 16, paddingTop: 16 },
  title: { ...typography.h2, marginBottom: 12 },
  listContent: { padding: 16, paddingBottom: 100 },
  row: { marginBottom: 10, padding: 14 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  rowName: { ...typography.h4, flexShrink: 1, marginRight: 8 },
  rowMeta: { ...typography.caption, marginTop: 2 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 16, marginBottom: 16, marginLeft: 16 },
  backText: { ...typography.body, fontWeight: '600' },
  formContent: { paddingHorizontal: 16, paddingBottom: 40 },
  errorText: { ...typography.caption, marginBottom: 8 },
  sectionCard: { marginBottom: 12 },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
});
