import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { ChevronLeft, UserPlus, Printer, Lock } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { typography } from '../../theme';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { FormInput } from '../../components/common/FormInput';
import { FormSelect } from '../../components/common/FormSelect';
import { SelectField } from '../../components/common/SelectField';
import { DatePickerField } from '../../components/common/DatePickerField';
import { ImagePickerField } from '../../components/common/ImagePickerField';
import { LoadingView } from '../../components/common/LoadingView';
import { COMPANY_OPTIONS, getCompanyUnits } from '../../utils/companyConfig';
import { normaliseAadhaar, isCompleteAadhaar, formatAadhaarInput, formatFullAadhaar } from '../../utils/aadhaar';
import { isCandidateApproved } from './candidateHelpers';
import { buildAppointmentPrintHtml } from '../../utils/appointmentPrintPdf';
import { downloadPdfToDevice } from '../../utils/pdf';

const GENDER_OPTIONS = ['MALE', 'FEMALE', 'OTHER'];
const MARITAL_OPTIONS = ['MARRIED', 'UNMARRIED'];
const DEFAULT_DEPARTMENTS = ['4P DEPT', 'Account', 'BLOCKING DEPT', 'Cutting', 'IT', 'Polish-02 (MFG)'];
const BLANK_MEMBER = { name: '', relation: '', dob: '', mobile: '', occupation: '' };

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', mid: '', surname: '' };
  if (parts.length === 1) return { first: parts[0], mid: '', surname: '' };
  if (parts.length === 2) return { first: parts[0], mid: '', surname: parts[1] };
  return { first: parts[0], mid: parts.slice(1, -1).join(' '), surname: parts[parts.length - 1] };
}

function buildInitialForm(raw, agentCompanyCode) {
  const { first, mid, surname } = splitName(raw?.name);
  return {
    emp_code: raw?.emp_code || '',
    joining_date: raw?.joining_date || new Date().toISOString().slice(0, 10),
    department: raw?.department || '',
    designation: raw?.designation || '',
    manager_name: raw?.manager_name || '',
    salary: raw?.salary ? String(raw.salary) : '',
    mobile_number: raw?.mobile_number || '',
    emp_whatsapp_no: raw?.emp_whatsapp_no || '',
    punching_no: raw?.punching_no || '',
    name_first: first,
    name_mid: mid,
    name_surname: surname,
    email: raw?.email || '',
    address: raw?.address || '',
    village: raw?.village || '',
    taluka: raw?.taluka || '',
    district: raw?.district || '',
    dob: raw?.dob || '',
    birth_place: raw?.birth_place || '',
    gender: raw?.gender || '',
    cast: raw?.cast || '',
    marital_status: raw?.marital_status || '',
    blood_group: raw?.blood_group || '',
    reference_name: raw?.reference_name || '',
    reference_mobile_no: raw?.reference_mobile_no || '',
    aadhar_card_no: formatAadhaarInput(raw?.aadhaar_full || raw?.aadhar_card_no || ''),
    bank_name: raw?.bank_name || '',
    pan_card_no: raw?.pan_card_no || '',
    bank_ifsc_code: raw?.bank_ifsc_code || '',
    education: raw?.education || '',
    bank_account_no: raw?.bank_account_no || '',
    company_code: raw?.company_code || agentCompanyCode || 'nidhi-impex',
    unit: raw?.unit || '',
    emp_signature: raw?.emp_signature || '',
  };
}

export function AppointmentFormScreen({ initialData, isPrefillFromTrial, onDone, onCancel }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const isEditMode = Boolean(initialData?.id) && !isPrefillFromTrial;
  const readOnly = isEditMode && isCandidateApproved(initialData.raw || {});
  const [printing, setPrinting] = useState(false);

  const [form, setForm] = useState(() => buildInitialForm(initialData?.raw, user?.company_code));
  const [members, setMembers] = useState(() => {
    const raw = initialData?.raw?.members;
    if (!raw) return [{ ...BLANK_MEMBER }, { ...BLANK_MEMBER }, { ...BLANK_MEMBER }, { ...BLANK_MEMBER }];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const list = Array.isArray(parsed) ? parsed : [];
      while (list.length < 4) list.push({ ...BLANK_MEMBER });
      return list.slice(0, 4).map((m) => ({ ...BLANK_MEMBER, ...m }));
    } catch (e) {
      return [{ ...BLANK_MEMBER }, { ...BLANK_MEMBER }, { ...BLANK_MEMBER }, { ...BLANK_MEMBER }];
    }
  });

  const [photo, setPhoto] = useState(initialData?.raw?.photo || null);
  const [adharImage, setAdharImage] = useState(initialData?.raw?.adhar_image || null);
  const [panImage, setPanImage] = useState(initialData?.raw?.pan_image || null);
  const [checkImage, setCheckImage] = useState(initialData?.raw?.check_image || null);
  const [accountBook, setAccountBook] = useState(initialData?.raw?.account_book || null);

  const aadhaarOnFile = !isPrefillFromTrial && Boolean(initialData?.raw?.aadhaar_full || initialData?.raw?.aadhaar_masked);

  const [departments, setDepartments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
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

  const departmentOptions = departments.length ? departments : DEFAULT_DEPARTMENTS;
  const unitOptions = useMemo(() => getCompanyUnits(form.company_code), [form.company_code]);

  const setField = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));

  const setMemberField = (index, key) => (value) => {
    setMembers((prev) => prev.map((m, i) => (i === index ? { ...m, [key]: value } : m)));
  };

  const canSubmit = !submitting;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      const fullName = [form.name_first, form.name_mid, form.name_surname]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(' ');

      const scalarFields = {
        joining_date: form.joining_date,
        department: form.department,
        designation: form.designation,
        manager_name: form.manager_name,
        salary: form.salary,
        mobile_number: form.mobile_number,
        emp_whatsapp_no: form.emp_whatsapp_no,
        punching_no: form.punching_no,
        name: fullName,
        email: form.email,
        address: form.address,
        village: form.village,
        taluka: form.taluka,
        district: form.district,
        dob: form.dob,
        birth_place: form.birth_place,
        gender: form.gender,
        cast: form.cast,
        marital_status: form.marital_status,
        blood_group: form.blood_group,
        reference_name: form.reference_name,
        reference_mobile_no: form.reference_mobile_no,
        bank_name: form.bank_name,
        pan_card_no: form.pan_card_no,
        bank_ifsc_code: form.bank_ifsc_code,
        education: form.education,
        bank_account_no: form.bank_account_no,
        company_code: form.company_code,
        unit: form.unit,
        emp_signature: form.emp_signature,
      };
      Object.entries(scalarFields).forEach(([key, value]) => {
        fd.append(key, value ?? '');
      });

      if (isCompleteAadhaar(form.aadhar_card_no)) {
        fd.append('aadhar_card_no', normaliseAadhaar(form.aadhar_card_no));
      }

      fd.append('members', JSON.stringify(members));

      if (photo && typeof photo !== 'string') fd.append('photo', photo);
      if (adharImage && typeof adharImage !== 'string') fd.append('adhar_image', adharImage);
      if (panImage && typeof panImage !== 'string') fd.append('pan_image', panImage);
      if (checkImage && typeof checkImage !== 'string') fd.append('check_image', checkImage);
      if (accountBook && typeof accountBook !== 'string') fd.append('account_book', accountBook);

      let res;
      if (isEditMode) {
        fd.append('id', String(initialData.id));
        res = await api.updateAppointment(fd);
      } else {
        if (isPrefillFromTrial) fd.append('trial_form_id', String(initialData.id));
        if (user?.id) fd.append('added_by', String(user.id));
        res = await api.submitAppointment(fd);
      }

      if (res?.status) {
        onDone();
      } else {
        setError(res?.message || 'Could not save this appointment.');
      }
    } catch (e) {
      setError(e.message || 'Could not save this appointment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const html = buildAppointmentPrintHtml(initialData.raw, user?.name);
      const { saved } = await downloadPdfToDevice(html, `Appointment Form - ${initialData.raw?.name || initialData.raw?.emp_code || ''}`);
      if (saved) Alert.alert('Saved', 'The appointment form PDF was saved to your device.');
    } catch (e) {
      Alert.alert('Could not print', e.message || 'Please try again.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onCancel} style={styles.backRow} activeOpacity={0.7}>
            <ChevronLeft size={18} color={theme.primary} />
            <Text style={[styles.backText, { color: theme.primary }]}>Cancel</Text>
          </TouchableOpacity>

          {isEditMode ? (
            <TouchableOpacity
              onPress={handlePrint}
              disabled={printing}
              style={[styles.printBtn, { borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}
            >
              <Printer size={15} color={theme.primary} />
              <Text style={[styles.printText, { color: theme.primary }]}>{printing ? 'Preparing…' : 'Print'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={[styles.formTitle, { color: theme.textPrimary }]}>
          {readOnly ? 'View Appointment' : isEditMode ? 'Edit Appointment' : isPrefillFromTrial ? 'Process into Appointment' : 'New Appointment'}
        </Text>

        {readOnly ? (
          <View style={[styles.readOnlyBanner, { backgroundColor: theme.amberBg, borderColor: theme.amber + '40' }]}>
            <Lock size={14} color={theme.amber} />
            <Text style={[styles.readOnlyText, { color: theme.amber }]}>
              This appointment is already approved and can no longer be edited — view only.
            </Text>
          </View>
        ) : null}

        {error ? (
          <Card style={[styles.errorCard, { backgroundColor: theme.roseBg, borderColor: theme.rose + '40' }]}>
            <Text style={{ color: theme.rose }}>{error}</Text>
          </Card>
        ) : null}

        <View pointerEvents={readOnly ? 'none' : 'auto'} style={readOnly && styles.readOnlyContent}>
        {form.emp_code ? (
          <Card style={styles.sectionCard} elevated>
            <FormInput label="Employee Code" value={form.emp_code} disabled />
          </Card>
        ) : null}

        <Card style={styles.sectionCard} elevated>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Photo</Text>
          <ImagePickerField label="Candidate Photo" value={photo} onChange={setPhoto} cameraOnly />
        </Card>

        <Card style={styles.sectionCard} elevated>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Personal Details</Text>
          <FormInput label="First Name" value={form.name_first} onChangeText={setField('name_first')} />
          <FormInput label="Middle Name" value={form.name_mid} onChangeText={setField('name_mid')} />
          <FormInput label="Surname" value={form.name_surname} onChangeText={setField('name_surname')} />
          <DatePickerField label="Date of Birth" value={form.dob} onChange={setField('dob')} />
          <FormSelect label="Gender" value={form.gender} onChange={setField('gender')} options={GENDER_OPTIONS} />
          <FormSelect label="Marital Status" value={form.marital_status} onChange={setField('marital_status')} options={MARITAL_OPTIONS} />
          <FormInput label="Blood Group" value={form.blood_group} onChangeText={setField('blood_group')} />
          <FormInput label="Cast" value={form.cast} onChangeText={setField('cast')} />
          <FormInput label="Birth Place" value={form.birth_place} onChangeText={setField('birth_place')} />
          <FormInput label="Education" value={form.education} onChangeText={setField('education')} />
        </Card>

        <Card style={styles.sectionCard} elevated>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Contact</Text>
          <FormInput label="Mobile Number" value={form.mobile_number} onChangeText={setField('mobile_number')} keyboardType="phone-pad" maxLength={10} />
          <FormInput label="WhatsApp Number" value={form.emp_whatsapp_no} onChangeText={setField('emp_whatsapp_no')} keyboardType="phone-pad" maxLength={10} />
          <FormInput label="Email" value={form.email} onChangeText={setField('email')} keyboardType="email-address" autoCapitalize="none" />
          <FormInput label="Reference Name" value={form.reference_name} onChangeText={setField('reference_name')} />
          <FormInput label="Reference Mobile" value={form.reference_mobile_no} onChangeText={setField('reference_mobile_no')} keyboardType="phone-pad" maxLength={10} />
        </Card>

        <Card style={styles.sectionCard} elevated>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Address</Text>
          <FormInput label="Resident Address" value={form.address} onChangeText={setField('address')} multiline />
          <FormInput label="Village" value={form.village} onChangeText={setField('village')} />
          <FormInput label="Taluka" value={form.taluka} onChangeText={setField('taluka')} />
          <FormInput label="District" value={form.district} onChangeText={setField('district')} />
        </Card>

        <Card style={styles.sectionCard} elevated>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Employment</Text>
          <DatePickerField label="Joining Date" value={form.joining_date} onChange={setField('joining_date')} />
          <SelectField label="Department" value={form.department} onChange={setField('department')} options={departmentOptions} placeholder="Select department" />
          <FormInput label="Designation" value={form.designation} onChangeText={setField('designation')} />
          <FormInput label="Manager Name" value={form.manager_name} onChangeText={setField('manager_name')} />
          <FormInput label="Salary" value={form.salary} onChangeText={setField('salary')} keyboardType="number-pad" />
          <FormInput label="Punching No" value={form.punching_no} onChangeText={setField('punching_no')} keyboardType="number-pad" />
          <FormSelect label="Company" value={form.company_code} onChange={(v) => setForm((p) => ({ ...p, company_code: v, unit: '' }))} options={COMPANY_OPTIONS} />
          <FormSelect label="Unit" value={form.unit} onChange={setField('unit')} options={unitOptions} disabled={!form.company_code} />
        </Card>

        <Card style={styles.sectionCard} elevated>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Identity & Bank</Text>
          <FormInput
            label="Aadhaar Number"
            value={form.aadhar_card_no}
            onChangeText={(v) => setField('aadhar_card_no')(formatAadhaarInput(v))}
            keyboardType="number-pad"
            maxLength={14}
            helperText={
              aadhaarOnFile
                ? `On file: ${formatFullAadhaar(initialData?.raw?.aadhaar_full)}. Leave blank to keep it, or enter all 12 digits to replace it.`
                : 'Enter all 12 digits to save an Aadhaar number.'
            }
          />
          <FormInput label="PAN Card No" value={form.pan_card_no} onChangeText={(v) => setField('pan_card_no')(v.toUpperCase())} maxLength={10} autoCapitalize="characters" placeholder="ABCDE1234F" />
          <FormInput label="Bank Name" value={form.bank_name} onChangeText={setField('bank_name')} />
          <FormInput label="Bank IFSC Code" value={form.bank_ifsc_code} onChangeText={(v) => setField('bank_ifsc_code')(v.toUpperCase())} maxLength={11} autoCapitalize="characters" placeholder="SBIN0001234" />
          <FormInput label="Bank Account No" value={form.bank_account_no} onChangeText={setField('bank_account_no')} keyboardType="number-pad" maxLength={18} />
        </Card>

        <Card style={styles.sectionCard} elevated>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Family Members</Text>
          {members.map((m, idx) => (
            <View key={idx} style={[styles.memberBlock, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, paddingTop: 12 }]}>
              <Text style={[styles.memberLabel, { color: theme.textMuted }]}>Member {idx + 1}</Text>
              <FormInput label="Name" value={m.name} onChangeText={setMemberField(idx, 'name')} />
              <FormInput label="Relation" value={m.relation} onChangeText={setMemberField(idx, 'relation')} />
              <DatePickerField label="Date of Birth" value={m.dob} onChange={setMemberField(idx, 'dob')} />
              <FormInput label="Mobile" value={m.mobile} onChangeText={setMemberField(idx, 'mobile')} keyboardType="phone-pad" maxLength={10} />
              <FormInput label="Occupation" value={m.occupation} onChangeText={setMemberField(idx, 'occupation')} />
            </View>
          ))}
        </Card>

        <Card style={styles.sectionCard} elevated>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Documents</Text>
          <ImagePickerField label="Aadhaar Card" value={adharImage} onChange={setAdharImage} />
          <ImagePickerField label="PAN Card" value={panImage} onChange={setPanImage} />
          <ImagePickerField label="Cheque" value={checkImage} onChange={setCheckImage} />
          <ImagePickerField label="Bank Passbook" value={accountBook} onChange={setAccountBook} />
        </Card>

        <Card style={styles.sectionCard} elevated>
          <FormInput label="Employee Signature" value={form.emp_signature} onChangeText={setField('emp_signature')} />
        </Card>
        </View>

        {!readOnly && (
          <Button
            title={isEditMode ? 'Save Changes' : 'Submit Appointment'}
            onPress={submit}
            loading={submitting}
            disabled={!canSubmit}
            icon={UserPlus}
            variant="gradient"
            style={styles.submitBtn}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 60 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { ...typography.body, fontWeight: '600' },
  printBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  printText: { ...typography.caption, fontWeight: '700' },
  formTitle: { ...typography.h2, marginBottom: 12 },
  readOnlyBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 16 },
  readOnlyText: { ...typography.caption, fontWeight: '600', flexShrink: 1 },
  // Read-only is conveyed by the banner and pointerEvents, not by dimming —
  // an opacity wash made the whole form look greyed out and unreadable.
  readOnlyContent: {},
  errorCard: { padding: 14, marginBottom: 16, borderWidth: 1 },
  sectionCard: { padding: 18, marginBottom: 16 },
  sectionTitle: { ...typography.h4, marginBottom: 14 },
  memberBlock: { marginBottom: 8 },
  memberLabel: { ...typography.caption, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase' },
  submitBtn: { marginBottom: 20 },
});
