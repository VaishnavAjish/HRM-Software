import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { ChevronLeft, UserPlus } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { api, ApiError } from '../../services/api';
import { typography } from '../../theme';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { FormInput } from '../../components/common/FormInput';
import { FormSelect } from '../../components/common/FormSelect';
import { SelectField } from '../../components/common/SelectField';
import { DatePickerField } from '../../components/common/DatePickerField';
import { EmptyState } from '../../components/common/EmptyState';
import { useDepartmentOptions } from '../../hooks/useDepartmentOptions';
import { COMPANY_OPTIONS, getCompanyUnits } from '../../utils/companyConfig';

const GENDER_OPTIONS = ['MALE', 'FEMALE', 'OTHER'];

const MODES = [
  { id: 'single', label: 'New Employee' },
  { id: 'bulk', label: 'Bulk Import' },
  { id: 'pending', label: 'Pending' },
];

function emptyForm(defaultCompany) {
  return {
    name: '',
    emp_code: '',
    company_code: defaultCompany || 'nidhi-impex',
    unit: '',
    department: '',
    designation: '',
    gender: '',
    dob: '',
    joining_date: new Date().toISOString().slice(0, 10),
    mobile_number: '',
    email: '',
    address: '',
    city: '',
    district: '',
    state: '',
    pin: '',
    pan_card_no: '',
    bank_name: '',
    bank_ifsc_code: '',
    bank_account_no: '',
    pf_no: '',
    esi_no: '',
    password: '',
  };
}

function SingleEmployeeForm({ onDone, onCancel }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const departmentOptions = useDepartmentOptions();
  const [form, setForm] = useState(() => emptyForm(user?.company_code));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const unitOptions = useMemo(() => getCompanyUnits(form.company_code), [form.company_code]);
  const set = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    setError(null);
    if (!form.name.trim()) return setError('Enter the employee’s name.');
    if (!form.company_code) return setError('Select a company.');

    setSubmitting(true);
    try {
      const res = await api.createEmployee(form);
      if (res?.status) {
        onDone(res.data);
      } else {
        setError(res?.message || 'Could not create the employee.');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the employee.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
        {error ? <Text style={[styles.errorText, { color: theme.rose }]}>{error}</Text> : null}

        <Card style={styles.sectionCard} elevated>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Identity</Text>
          <FormInput label="Full Name" value={form.name} onChangeText={set('name')} />
          <FormInput label="Employee Code" value={form.emp_code} onChangeText={set('emp_code')} placeholder="Auto-generated if left blank" autoCapitalize="characters" />
          <FormSelect label="Gender" value={form.gender} onChange={set('gender')} options={GENDER_OPTIONS} />
          <DatePickerField label="Date of Birth" value={form.dob} onChange={set('dob')} />
        </Card>

        <Card style={styles.sectionCard} elevated>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Employment</Text>
          <SelectField label="Company" value={form.company_code} onChange={(v) => setForm((prev) => ({ ...prev, company_code: v, unit: '' }))} options={COMPANY_OPTIONS} searchable={false} />
          <SelectField label="Unit / Branch" value={form.unit} onChange={set('unit')} options={unitOptions} placeholder="Select unit" searchable={false} />
          <SelectField label="Department" value={form.department} onChange={set('department')} options={departmentOptions} />
          <FormInput label="Designation" value={form.designation} onChangeText={set('designation')} />
          <DatePickerField label="Joining Date" value={form.joining_date} onChange={set('joining_date')} />
        </Card>

        <Card style={styles.sectionCard} elevated>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Contact</Text>
          <FormInput label="Mobile Number" value={form.mobile_number} onChangeText={set('mobile_number')} keyboardType="phone-pad" />
          <FormInput label="Email" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
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

        <Card style={styles.sectionCard} elevated>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Account Security</Text>
          <FormInput
            label="Login Password"
            value={form.password}
            onChangeText={set('password')}
            placeholder="Leave blank to auto-generate"
            secureTextEntry
          />
        </Card>

        <View style={styles.actionsRow}>
          <Button title="Cancel" variant="outline" onPress={onCancel} style={{ flex: 1 }} />
          <Button title="Create Employee" variant="gradient" icon={UserPlus} onPress={submit} loading={submitting} style={{ flex: 1 }} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function AddEmployeeScreen({ onDone, onCancel }) {
  const { theme } = useTheme();
  const [mode, setMode] = useState('single');

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <TouchableOpacity style={styles.backRow} onPress={onCancel} activeOpacity={0.7}>
        <ChevronLeft size={18} color={theme.primary} />
        <Text style={[styles.backText, { color: theme.primary }]}>Employees</Text>
      </TouchableOpacity>

      <View style={[styles.tabBar, { backgroundColor: theme.surfaceElevated }]}>
        {MODES.map((m) => {
          const active = mode === m.id;
          return (
            <TouchableOpacity
              key={m.id}
              style={[styles.tabItem, active && { backgroundColor: theme.primary }]}
              onPress={() => setMode(m.id)}
            >
              <Text style={[styles.tabLabel, { color: active ? '#FFFFFF' : theme.textMuted }]}>{m.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {mode === 'single' ? <SingleEmployeeForm onDone={onDone} onCancel={onCancel} /> : null}
      {mode !== 'single' ? (
        <EmptyState
          icon={UserPlus}
          title="Coming soon"
          message={mode === 'bulk' ? 'Bulk Excel import is being built next.' : 'Assigning credentials to pending appointments is planned for a later rollout.'}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 50, marginBottom: 16, marginLeft: 16 },
  backText: { ...typography.body, fontWeight: '600' },
  tabBar: { flexDirection: 'row', padding: 4, borderRadius: 16, marginHorizontal: 16, marginBottom: 12 },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12 },
  tabLabel: { ...typography.caption, fontWeight: '700' },
  formContent: { paddingHorizontal: 16, paddingBottom: 40 },
  errorText: { ...typography.caption, marginBottom: 8 },
  sectionCard: { marginBottom: 12 },
  sectionTitle: { ...typography.h4, marginBottom: 14 },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
});
