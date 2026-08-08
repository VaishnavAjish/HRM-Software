import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { ShieldCheck, Pencil, Check, X, BadgeCheck } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { typography, shadows } from '../theme';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Avatar } from '../components/common/Avatar';
import { formatDate } from '../utils/format';

const TABS = [
  { id: 'basic', label: 'Basic' },
  { id: 'address', label: 'Address' },
  { id: 'bank', label: 'Bank & ID' },
];

const BASIC_FIELDS = [
  { key: 'email', label: 'Email', keyboardType: 'email-address' },
  { key: 'mobile_number', label: 'Mobile Number', keyboardType: 'phone-pad' },
  { key: 'dob', label: 'Date of Birth', placeholder: 'YYYY-MM-DD' },
  { key: 'gender', label: 'Gender' },
  { key: 'department', label: 'Department' },
  { key: 'designation', label: 'Designation' },
];

const ADDRESS_FIELDS = [
  { key: 'address', label: 'Full Address', multiline: true },
  { key: 'city', label: 'City' },
  { key: 'district', label: 'District' },
  { key: 'state', label: 'State' },
  { key: 'pin', label: 'PIN Code', keyboardType: 'number-pad' },
];

const BANK_FIELDS = [
  { key: 'pan_card_no', label: 'PAN Card No', placeholder: 'ABCDE1234F', autoCapitalize: 'characters' },
  { key: 'bank_name', label: 'Bank Name' },
  { key: 'bank_ifsc_code', label: 'Bank IFSC', placeholder: 'SBIN0001234', autoCapitalize: 'characters' },
  { key: 'bank_account_no', label: 'Bank Account No', keyboardType: 'number-pad' },
  { key: 'pf_no', label: 'PF Account No' },
  { key: 'esi_no', label: 'ESI ID No' },
];

const ALL_FIELDS = [...BASIC_FIELDS, ...ADDRESS_FIELDS, ...BANK_FIELDS];

export function ProfileScreen() {
  const { theme } = useTheme();
  const { user, role, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState('basic');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => initFormFromUser(user));
  const [errorMsg, setErrorMsg] = useState(null);

  const completion = useMemo(() => {
    const filled = ALL_FIELDS.filter((f) => (user?.[f.key] ?? '').toString().trim().length > 0).length;
    return Math.round((filled / ALL_FIELDS.length) * 100);
  }, [user]);

  const startEdit = () => {
    setForm(initFormFromUser(user));
    setErrorMsg(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setErrorMsg(null);
  };

  const save = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await api.updateProfile(form);
      if (res?.status) {
        updateUser(res.user || form);
        setEditing(false);
      } else {
        setErrorMsg(res?.message || 'Could not save your profile.');
      }
    } catch (e) {
      setErrorMsg(e.message || 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const fieldsForTab = activeTab === 'basic' ? BASIC_FIELDS : activeTab === 'address' ? ADDRESS_FIELDS : BANK_FIELDS;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={styles.heroCard} elevated>
        <Avatar name={user?.name} uri={user?.photo} size={72} />
        <Text style={[styles.name, { color: theme.textPrimary }]}>{user?.name || '—'}</Text>
        <Text style={[styles.designation, { color: theme.textMuted }]}>
          {user?.designation || (role === 'agent' ? 'Agent' : 'Employee')}
          {user?.department ? ` · ${user.department}` : ''}
        </Text>

        <View style={styles.badgeRow}>
          <Badge label={role === 'agent' ? 'Agent' : 'Employee'} variant={role === 'agent' ? 'violet' : 'cyan'} />
          {user?.emp_code ? <Badge label={`ID ${user.emp_code}`} variant="default" /> : null}
          {user?.status === 0 || user?.status === '0' ? <Badge label="Active" variant="emerald" /> : null}
        </View>

        <View style={styles.completionRow}>
          <View style={[styles.progressTrack, { backgroundColor: theme.surfaceElevated }]}>
            <View style={[styles.progressFill, { width: `${completion}%`, backgroundColor: theme.primary }]} />
          </View>
          <Text style={[styles.progressLabel, { color: theme.textMuted }]}>{completion}% complete</Text>
        </View>
      </Card>

      <Card style={styles.readonlyCard} elevated>
        <ReadonlyRow label="Employee Code" value={user?.emp_code} theme={theme} />
        <ReadonlyRow label="Company Code" value={user?.company_code} theme={theme} />
        <ReadonlyRow label="Unit / Branch" value={user?.unit} theme={theme} />
        <ReadonlyRow label="Joining Date" value={user?.joining_date ? formatDate(user.joining_date) : '—'} theme={theme} />
        {user?.has_aadhaar ? (
          <View style={styles.aadhaarRow}>
            <ShieldCheck size={14} color={theme.emerald} />
            <Text style={[styles.aadhaarText, { color: theme.textMuted }]}>
              Aadhaar on file: {user.aadhaar_masked}
            </Text>
            <BadgeCheck size={14} color={theme.emerald} />
          </View>
        ) : null}
      </Card>

      <View style={[styles.tabBar, { backgroundColor: theme.surfaceElevated }]}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tabItem, activeTab === tab.id && { backgroundColor: theme.primary }]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text style={[styles.tabLabel, { color: activeTab === tab.id ? '#FFFFFF' : theme.textMuted }]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Card style={styles.fieldsCard} elevated>
        <View style={styles.fieldsHeader}>
          <Text style={[styles.fieldsTitle, { color: theme.textPrimary }]}>
            {TABS.find((t) => t.id === activeTab)?.label} Details
          </Text>
          {!editing ? (
            <TouchableOpacity style={styles.editBtn} onPress={startEdit}>
              <Pencil size={14} color={theme.primary} />
              <Text style={[styles.editBtnText, { color: theme.primary }]}>Edit</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.editActions}>
              <TouchableOpacity onPress={cancelEdit} style={styles.iconBtn}>
                <X size={16} color={theme.rose} />
              </TouchableOpacity>
              <TouchableOpacity onPress={save} style={styles.iconBtn} disabled={saving}>
                <Check size={16} color={theme.emerald} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {errorMsg ? <Text style={[styles.errorText, { color: theme.rose }]}>{errorMsg}</Text> : null}

        {fieldsForTab.map((f) => (
          <View key={f.key} style={styles.fieldRow}>
            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{f.label}</Text>
            {editing ? (
              <TextInput
                style={[
                  styles.fieldInput,
                  f.multiline && styles.fieldInputMultiline,
                  { color: theme.textPrimary, backgroundColor: theme.surfaceElevated, borderColor: theme.border },
                ]}
                value={form[f.key] ?? ''}
                onChangeText={(v) => setForm((prev) => ({ ...prev, [f.key]: v }))}
                placeholder={f.placeholder}
                placeholderTextColor={theme.textMuted}
                keyboardType={f.keyboardType}
                autoCapitalize={f.autoCapitalize || 'sentences'}
                multiline={f.multiline}
              />
            ) : (
              <Text style={[styles.fieldValue, { color: theme.textPrimary }]}>{user?.[f.key] || '—'}</Text>
            )}
          </View>
        ))}

        {editing && (
          <Button title="Save Changes" onPress={save} loading={saving} variant="gradient" style={styles.saveBtn} />
        )}
      </Card>
    </ScrollView>
  );
}

function initFormFromUser(user) {
  const form = {};
  ALL_FIELDS.forEach((f) => {
    form[f.key] = user?.[f.key] != null ? String(user[f.key]) : '';
  });
  return form;
}

function ReadonlyRow({ label, value, theme }) {
  return (
    <View style={styles.readonlyRow}>
      <Text style={[styles.readonlyLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.readonlyValue, { color: theme.textPrimary }]}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 120 },
  heroCard: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 12,
  },
  name: {
    ...typography.h3,
    marginTop: 12,
  },
  designation: {
    ...typography.body,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  completionRow: {
    width: '100%',
    marginTop: 16,
    alignItems: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressLabel: {
    ...typography.micro,
    marginTop: 6,
  },
  readonlyCard: {
    marginBottom: 12,
    padding: 16,
  },
  readonlyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  readonlyLabel: {
    ...typography.body,
  },
  readonlyValue: {
    ...typography.body,
    fontWeight: '600',
  },
  aadhaarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148,163,184,0.3)',
  },
  aadhaarText: {
    ...typography.caption,
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 16,
    marginBottom: 12,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  tabLabel: {
    ...typography.caption,
    fontWeight: '700',
  },
  fieldsCard: {
    padding: 18,
  },
  fieldsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fieldsTitle: {
    ...typography.h4,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editBtnText: {
    ...typography.caption,
    fontWeight: '700',
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
  },
  iconBtn: {
    padding: 4,
  },
  errorText: {
    ...typography.caption,
    marginBottom: 8,
  },
  fieldRow: {
    marginBottom: 14,
  },
  fieldLabel: {
    ...typography.caption,
    marginBottom: 6,
  },
  fieldValue: {
    ...typography.body,
    fontWeight: '600',
  },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  fieldInputMultiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  saveBtn: {
    marginTop: 8,
  },
});
