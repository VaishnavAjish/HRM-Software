import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ShieldCheck, Pencil, BadgeCheck, Download, Camera, FileText, ChevronRight, ChevronLeft, AlertTriangle, LogOut,
  Mail, Phone, Calendar, Users, Building2, Briefcase, Home, MapPin, Hash, CreditCard, Landmark, Wallet, Clock, Ticket,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { typography, shadows } from '../theme';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Avatar } from '../components/common/Avatar';
import { FormInput } from '../components/common/FormInput';
import { FormSelect } from '../components/common/FormSelect';
import { SelectField } from '../components/common/SelectField';
import { DatePickerField } from '../components/common/DatePickerField';
import { formatDate } from '../utils/format';
import { downloadPdfToDevice } from '../utils/pdf';
import { buildAppointmentPrintHtml } from '../utils/appointmentPrintPdf';
import { BASIC_FIELDS, ADDRESS_FIELDS, BANK_FIELDS, ALL_FIELDS, computeProfileCompletion } from '../utils/profileCompletion';
import { offerSettingsShortcut } from '../utils/withTimeout';
import { captureCameraPhoto, CameraPermissionError } from '../utils/cameraCapture';

const TABS = [
  { id: 'basic', label: 'Basic', icon: Users },
  { id: 'address', label: 'Address', icon: MapPin },
  { id: 'bank', label: 'Bank & ID', icon: Landmark },
];

const FIELD_ICONS = {
  email: Mail,
  mobile_number: Phone,
  dob: Calendar,
  gender: Users,
  department: Building2,
  designation: Briefcase,
  address: Home,
  city: MapPin,
  district: MapPin,
  state: MapPin,
  pin: Hash,
  pan_card_no: CreditCard,
  bank_name: Landmark,
  bank_ifsc_code: Landmark,
  bank_account_no: Wallet,
  pf_no: FileText,
  esi_no: FileText,
};

const GENDER_OPTIONS = ['MALE', 'FEMALE', 'OTHER'];
const DEFAULT_DEPARTMENTS = ['4P DEPT', 'Account', 'BLOCKING DEPT', 'Cutting', 'IT', 'Polish-02 (MFG)'];

const FIELD_VALIDATORS = {
  email: (v) => (!v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Enter a valid email address'),
  mobile_number: (v) => (!v || /^\d{10}$/.test(v) ? null : 'Enter a valid 10-digit mobile number'),
  pin: (v) => (!v || /^\d{6}$/.test(v) ? null : 'PIN code must be 6 digits'),
  pan_card_no: (v) => (!v || /^[A-Z]{5}\d{4}[A-Z]$/.test(v.toUpperCase()) ? null : 'Format: ABCDE1234F'),
  bank_ifsc_code: (v) => (!v || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.toUpperCase()) ? null : 'Enter a valid IFSC code'),
  bank_account_no: (v) => (!v || /^\d{6,18}$/.test(v) ? null : 'Enter a valid account number'),
};

export function ProfileScreen({ requireCompletion = false, onNavigateAdminScreen, onBack }) {
  const { theme } = useTheme();
  const { user, role, updateUser, logout } = useAuth();
  // Agents and admins have no employee record — no payroll, no appointment
  // form, no completion requirement. Their profile is just who they are, a
  // way to edit contact details, and a way out.
  const isAgent = role === 'agent';
  const isAdmin = role === 'admin';
  const simplified = isAgent || isAdmin;
  const roleLabel = isAgent ? 'Agent' : isAdmin ? 'Admin' : 'Employee';
  const roleBadgeVariant = isAgent ? 'violet' : isAdmin ? 'primary' : 'cyan';
  const [activeTab, setActiveTab] = useState('basic');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => initFormFromUser(user));
  const [errorMsg, setErrorMsg] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [departments, setDepartments] = useState([]);

  const { percent: completion } = useMemo(() => computeProfileCompletion(user), [user]);
  const departmentOptions = departments.length ? departments : DEFAULT_DEPARTMENTS;

  useEffect(() => {
    if (simplified) return;
    (async () => {
      try {
        const res = await api.getDepartments();
        if (res?.status && res.data?.length) {
          setDepartments(res.data.map((d) => d.name));
        }
      } catch (e) {
        // Falls back to the default list below.
      }
    })();
  }, []);

  const startEdit = () => {
    setForm(initFormFromUser(user));
    setErrorMsg(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setErrorMsg(null);
  };

  const switchTab = (tabId) => {
    if (editing) cancelEdit();
    setActiveTab(tabId);
  };

  const fieldsForTab = activeTab === 'basic' ? BASIC_FIELDS : activeTab === 'address' ? ADDRESS_FIELDS : BANK_FIELDS;

  const fieldErrors = useMemo(() => {
    const errors = {};
    fieldsForTab.forEach((f) => {
      const validator = FIELD_VALIDATORS[f.key];
      if (validator) {
        const err = validator((form[f.key] || '').trim());
        if (err) errors[f.key] = err;
      }
    });
    return errors;
  }, [form, fieldsForTab]);
  const hasErrors = Object.keys(fieldErrors).length > 0;

  const save = async () => {
    if (hasErrors) return;
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

  const uploadPhoto = async (asset) => {
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append('photo', { uri: asset.uri, name: asset.fileName || `avatar-${Date.now()}.jpg`, type: asset.mimeType || 'image/jpeg' });
      const res = await api.updateProfile(fd);
      if (res?.status) {
        updateUser(res.user || {});
      } else {
        Alert.alert('Could not update photo', res?.message || 'Please try again.');
      }
    } catch (e) {
      Alert.alert('Could not update photo', e.message || 'Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const pickPhoto = () => {
    Alert.alert('Update profile photo', undefined, [
      {
        text: 'Camera',
        onPress: async () => {
          try {
            const result = await captureCameraPhoto();
            if (!result.canceled) {
              uploadPhoto({ uri: result.uri, fileName: result.fileName, mimeType: result.mimeType });
            }
          } catch (e) {
            if (e instanceof CameraPermissionError) {
              offerSettingsShortcut('Camera permission needed', e.message);
            } else {
              // Without this the rejection vanishes and the button looks dead.
              Alert.alert('Could not open the camera', e?.message || String(e));
            }
          }
        },
      },
      {
        text: 'Gallery',
        onPress: async () => {
          try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) return Alert.alert('Photo library permission needed', 'Enable photo access to choose a picture.');
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
            if (!result.canceled && result.assets?.[0]) uploadPhoto(result.assets[0]);
          } catch (e) {
            Alert.alert('Could not open the gallery', e?.message || String(e));
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const confirmLogout = () => {
    Alert.alert('Log out', 'You will need to sign in again to continue.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: logout },
    ]);
  };

  const downloadAppointmentForm = async () => {
    setDownloading(true);
    try {
      const html = buildAppointmentPrintHtml(user, user?.name);
      const { saved } = await downloadPdfToDevice(html, `Appointment Form - ${user?.name || user?.emp_code || ''}`);
      if (saved) Alert.alert('Saved', 'The appointment form PDF was saved to your device.');
    } catch (e) {
      Alert.alert('Could not generate PDF', e.message || 'Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {onBack ? (
        <TouchableOpacity style={styles.backRow} onPress={onBack} activeOpacity={0.7}>
          <ChevronLeft size={18} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary }]}>Back to More</Text>
        </TouchableOpacity>
      ) : null}
      {requireCompletion ? (
        <View style={[styles.completionBanner, { backgroundColor: theme.amberBg, borderColor: theme.amber + '40' }]}>
          <AlertTriangle size={16} color={theme.amber} />
          <Text style={[styles.completionBannerText, { color: theme.amber }]}>
            Complete your profile to unlock the rest of the app. PF and ESI numbers are optional — everything else is required.
          </Text>
        </View>
      ) : null}

      <Card style={styles.heroCard} elevated>
        <LinearGradient colors={theme.primaryGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroBanner} />
        <View style={styles.heroBody}>
          <TouchableOpacity onPress={pickPhoto} activeOpacity={0.85} disabled={uploadingPhoto} style={styles.avatarWrap}>
            <View style={[styles.avatarRing, { backgroundColor: theme.surfaceCard }]}>
              <Avatar name={user?.name} uri={user?.photo} size={84} />
            </View>
            <View style={[styles.avatarBadge, { backgroundColor: theme.primary, borderColor: theme.surfaceCard }]}>
              <Camera size={13} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
          {uploadingPhoto ? <Text style={[styles.uploadingText, { color: theme.textMuted }]}>Uploading…</Text> : null}
          <Text style={[styles.name, { color: theme.textPrimary }]}>{user?.name || '—'}</Text>
          <Text style={[styles.designation, { color: theme.textMuted }]}>
            {user?.designation || roleLabel}
            {user?.department ? ` · ${user.department}` : ''}
          </Text>

          <View style={styles.badgeRow}>
            <Badge label={roleLabel} variant={roleBadgeVariant} />
            {user?.emp_code ? <Badge label={`ID ${user.emp_code}`} variant="default" /> : null}
            {user?.status === 0 || user?.status === '0' ? <Badge label="Active" variant="emerald" /> : null}
          </View>

          {!simplified ? (
            <View style={styles.completionRow}>
              <View style={[styles.progressTrack, { backgroundColor: theme.surfaceElevated }]}>
                <View style={[styles.progressFill, { width: `${completion}%`, backgroundColor: completion >= 100 ? theme.emerald : theme.primary }]} />
              </View>
              <Text style={[styles.progressLabel, { color: theme.textMuted }]}>{completion}% complete</Text>
            </View>
          ) : null}
        </View>
      </Card>

      <Card style={styles.infoCard} elevated>
        <View style={styles.infoGrid}>
          {!simplified ? <InfoTile icon={Briefcase} label="Employee Code" value={user?.emp_code} theme={theme} /> : null}
          <InfoTile icon={Building2} label={simplified ? 'Company' : 'Company Code'} value={user?.company_code} theme={theme} />
          <InfoTile icon={MapPin} label={simplified ? 'Branch' : 'Unit / Branch'} value={user?.unit} theme={theme} />
          {!simplified ? (
            <InfoTile icon={Calendar} label="Joining Date" value={user?.joining_date ? formatDate(user.joining_date) : '—'} theme={theme} />
          ) : null}
        </View>
        {!simplified && user?.has_aadhaar ? (
          <View style={styles.aadhaarRow}>
            <ShieldCheck size={14} color={theme.emerald} />
            <Text style={[styles.aadhaarText, { color: theme.textMuted }]}>
              Aadhaar on file: {user.aadhaar_masked}
            </Text>
            <BadgeCheck size={14} color={theme.emerald} />
          </View>
        ) : null}
      </Card>

      {isAdmin ? (
        <Card style={styles.fieldsCard} elevated>
          <Text style={[styles.fieldsTitle, { color: theme.textPrimary, marginBottom: 14 }]}>
            Admin Controls & Operations
          </Text>

          <TouchableOpacity
            style={styles.adminRowOption}
            onPress={() => onNavigateAdminScreen?.('attendance')}
            activeOpacity={0.7}
          >
            <View style={[styles.adminOptionIcon, { backgroundColor: theme.primary + '15' }]}>
              <Calendar size={18} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.adminOptionTitle, { color: theme.textPrimary }]}>Attendance Logs</Text>
              <Text style={[styles.adminOptionSub, { color: theme.textMuted }]}>View daily attendance & employee punch records</Text>
            </View>
            <ChevronRight size={18} color={theme.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.adminRowOption}
            onPress={() => onNavigateAdminScreen?.('shifts')}
            activeOpacity={0.7}
          >
            <View style={[styles.adminOptionIcon, { backgroundColor: theme.primary + '15' }]}>
              <Clock size={18} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.adminOptionTitle, { color: theme.textPrimary }]}>Shifts & Rosters</Text>
              <Text style={[styles.adminOptionSub, { color: theme.textMuted }]}>Manage shift timings and employee assignments</Text>
            </View>
            <ChevronRight size={18} color={theme.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.adminRowOption}
            onPress={() => onNavigateAdminScreen?.('tickets')}
            activeOpacity={0.7}
          >
            <View style={[styles.adminOptionIcon, { backgroundColor: theme.primary + '15' }]}>
              <Ticket size={18} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.adminOptionTitle, { color: theme.textPrimary }]}>Helpdesk Tickets</Text>
              <Text style={[styles.adminOptionSub, { color: theme.textMuted }]}>Review and resolve employee support issues</Text>
            </View>
            <ChevronRight size={18} color={theme.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.adminRowOption, { borderBottomWidth: 0 }]}
            onPress={() => onNavigateAdminScreen?.('accounts')}
            activeOpacity={0.7}
          >
            <View style={[styles.adminOptionIcon, { backgroundColor: theme.primary + '15' }]}>
              <ShieldCheck size={18} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.adminOptionTitle, { color: theme.textPrimary }]}>Manage Admins</Text>
              <Text style={[styles.adminOptionSub, { color: theme.textMuted }]}>View admin accounts & manage permissions</Text>
            </View>
            <ChevronRight size={18} color={theme.textMuted} />
          </TouchableOpacity>
        </Card>
      ) : null}

      {!simplified ? (
      <>
      <TouchableOpacity onPress={downloadAppointmentForm} disabled={downloading} activeOpacity={0.85}>
        <Card style={styles.downloadCard} elevated>
          <LinearGradient colors={theme.primaryGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.downloadIconWrap}>
            <FileText size={20} color="#FFFFFF" />
          </LinearGradient>
          <View style={styles.downloadTextWrap}>
            <Text style={[styles.downloadTitle, { color: theme.textPrimary }]}>
              {downloading ? 'Preparing PDF…' : 'Download Appointment Form'}
            </Text>
            <Text style={[styles.downloadSubtitle, { color: theme.textMuted }]}>Saved as a PDF to your device</Text>
          </View>
          {downloading ? <Download size={18} color={theme.textMuted} /> : <ChevronRight size={18} color={theme.textMuted} />}
        </Card>
      </TouchableOpacity>

      <View style={[styles.tabBar, { backgroundColor: theme.surfaceElevated }]}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabItem, active && { backgroundColor: theme.primary }]}
              onPress={() => switchTab(tab.id)}
            >
              <Icon size={13} color={active ? '#FFFFFF' : theme.textMuted} />
              <Text style={[styles.tabLabel, { color: active ? '#FFFFFF' : theme.textMuted }]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Card style={styles.fieldsCard} elevated>
        <View style={styles.fieldsHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldsTitle, { color: theme.textPrimary }]}>
              {TABS.find((t) => t.id === activeTab)?.label} Details
            </Text>
            {editing ? (
              <Text style={[styles.editingHint, { color: theme.primary }]}>Editing — update the fields below</Text>
            ) : null}
          </View>
          {!editing ? (
            <TouchableOpacity
              style={[styles.editBtn, { backgroundColor: theme.primary + '12', borderColor: theme.primary + '30' }]}
              onPress={startEdit}
            >
              <Pencil size={13} color={theme.primary} />
              <Text style={[styles.editBtnText, { color: theme.primary }]}>Edit</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {errorMsg ? <Text style={[styles.errorText, { color: theme.rose }]}>{errorMsg}</Text> : null}

        {!editing ? (
          fieldsForTab.map((f, idx) => {
            const Icon = FIELD_ICONS[f.key] || FileText;
            return (
              <View
                key={f.key}
                style={[
                  styles.viewRow,
                  idx !== fieldsForTab.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
                ]}
              >
                <View style={[styles.viewIconWrap, { backgroundColor: theme.primary + '12' }]}>
                  <Icon size={15} color={theme.primary} />
                </View>
                <View style={styles.viewTextWrap}>
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{f.label}</Text>
                  <Text style={[styles.fieldValue, { color: theme.textPrimary }]}>{user?.[f.key] || '—'}</Text>
                </View>
              </View>
            );
          })
        ) : (
          <>
            {fieldsForTab.map((f) => (
              <View key={f.key} style={styles.editFieldWrap}>
                {renderFieldEditor(f, form[f.key] ?? '', (v) => setForm((prev) => ({ ...prev, [f.key]: v })), departmentOptions)}
                {fieldErrors[f.key] ? <Text style={[styles.fieldError, { color: theme.rose }]}>{fieldErrors[f.key]}</Text> : null}
              </View>
            ))}

            <View style={styles.editActionsRow}>
              <Button title="Cancel" variant="outline" onPress={cancelEdit} style={styles.editActionBtn} />
              <Button
                title="Save Changes"
                variant="gradient"
                onPress={save}
                loading={saving}
                disabled={hasErrors}
                style={styles.editActionBtn}
              />
            </View>
          </>
        )}
      </Card>
      </>
      ) : null}

      <TouchableOpacity onPress={confirmLogout} activeOpacity={0.85}>
        <Card style={styles.logoutCard} elevated>
          <View style={[styles.logoutIconWrap, { backgroundColor: theme.roseBg }]}>
            <LogOut size={18} color={theme.rose} />
          </View>
          <View style={styles.logoutTextWrap}>
            <Text style={[styles.logoutTitle, { color: theme.rose }]}>Log out</Text>
            <Text style={[styles.logoutSubtitle, { color: theme.textMuted }]}>
              Sign out of this device
            </Text>
          </View>
          <ChevronRight size={18} color={theme.textMuted} />
        </Card>
      </TouchableOpacity>
    </ScrollView>
  );
}

function renderFieldEditor(f, value, onChange, departmentOptions) {
  if (f.key === 'dob') {
    return <DatePickerField label={f.label} value={value} onChange={onChange} />;
  }
  if (f.key === 'gender') {
    return <FormSelect label={f.label} value={value} onChange={onChange} options={GENDER_OPTIONS} />;
  }
  if (f.key === 'department') {
    return (
      <SelectField
        label={f.label}
        value={value}
        onChange={onChange}
        options={departmentOptions}
        placeholder="Select department"
      />
    );
  }
  return (
    <FormInput
      label={f.label}
      value={value}
      onChangeText={onChange}
      placeholder={f.placeholder}
      keyboardType={f.keyboardType}
      autoCapitalize={f.autoCapitalize || 'sentences'}
      multiline={f.multiline}
    />
  );
}

function initFormFromUser(user) {
  const form = {};
  ALL_FIELDS.forEach((f) => {
    const raw = user?.[f.key] != null ? String(user[f.key]) : '';
    // Gender is edited via fixed-case chips (MALE/FEMALE/OTHER) — normalise so
    // the chip for the employee's existing value highlights correctly.
    form[f.key] = f.key === 'gender' ? raw.toUpperCase() : raw;
  });
  return form;
}

function InfoTile({ icon: Icon, label, value, theme }) {
  return (
    <View style={[styles.infoTile, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
      <View style={[styles.infoIconWrap, { backgroundColor: theme.primary + '15' }]}>
        <Icon size={14} color={theme.primary} />
      </View>
      <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: theme.textPrimary }]} numberOfLines={1}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 120 },
  completionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  completionBannerText: {
    ...typography.caption,
    fontWeight: '600',
    flex: 1,
  },
  heroCard: {
    padding: 0,
    alignItems: 'center',
    marginBottom: 12,
  },
  heroBanner: {
    width: '100%',
    height: 86,
  },
  heroBody: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 22,
    marginTop: -46,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarRing: {
    padding: 4,
    borderRadius: 46,
    ...shadows.card,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  uploadingText: {
    ...typography.micro,
    marginTop: 8,
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
  infoCard: {
    marginBottom: 12,
    padding: 16,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  infoTile: {
    width: '47%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  infoIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  infoLabel: {
    ...typography.micro,
  },
  infoValue: {
    ...typography.body,
    fontWeight: '700',
    marginTop: 2,
  },
  aadhaarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148,163,184,0.3)',
  },
  aadhaarText: {
    ...typography.caption,
    flex: 1,
  },
  downloadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 16,
    gap: 12,
  },
  downloadIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadTextWrap: {
    flex: 1,
  },
  downloadTitle: {
    ...typography.h4,
  },
  downloadSubtitle: {
    ...typography.caption,
    marginTop: 2,
  },
  tabBar: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 16,
    marginBottom: 12,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 12,
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
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  fieldsTitle: {
    ...typography.h4,
  },
  editingHint: {
    ...typography.micro,
    marginTop: 3,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
  },
  editBtnText: {
    ...typography.caption,
    fontWeight: '700',
  },
  errorText: {
    ...typography.caption,
    marginBottom: 8,
  },
  viewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  viewIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewTextWrap: {
    flex: 1,
  },
  fieldLabel: {
    ...typography.caption,
  },
  fieldValue: {
    ...typography.body,
    fontWeight: '600',
    marginTop: 2,
  },
  editFieldWrap: {
    marginBottom: 2,
  },
  fieldError: {
    ...typography.micro,
    marginTop: -10,
    marginBottom: 10,
  },
  editActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  editActionBtn: {
    flex: 1,
  },
  logoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginTop: 14,
    gap: 12,
  },
  logoutIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutTextWrap: {
    flex: 1,
  },
  logoutTitle: {
    ...typography.h4,
  },
  logoutSubtitle: {
    ...typography.micro,
    marginTop: 2,
  },
  adminRowOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  adminOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminOptionTitle: {
    ...typography.body,
    fontWeight: '700',
  },
  adminOptionSub: {
    ...typography.micro,
    marginTop: 2,
  },
});
