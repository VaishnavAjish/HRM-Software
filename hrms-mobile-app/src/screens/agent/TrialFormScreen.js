import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { ChevronLeft, FileText, Printer, Lock } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { api } from '../../services/api';
import { typography } from '../../theme';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { FormInput } from '../../components/common/FormInput';
import { FormSelect } from '../../components/common/FormSelect';
import { SelectField } from '../../components/common/SelectField';
import { DatePickerField } from '../../components/common/DatePickerField';
import { ImagePickerField } from '../../components/common/ImagePickerField';
import { getCompanyUnits } from '../../utils/companyConfig';
import { normaliseAadhaar, isCompleteAadhaar, formatAadhaarInput, formatFullAadhaar } from '../../utils/aadhaar';
import { isCandidateProcessed } from './candidateHelpers';
import { buildTrialPrintHtml } from '../../utils/trialPrintPdf';
import { downloadPdfToDevice } from '../../utils/pdf';

const GENDER_OPTIONS = ['MALE', 'FEMALE'];
const DEFAULT_DEPARTMENTS = ['4P DEPT', 'Account', 'BLOCKING DEPT', 'Cutting', 'IT', 'Polish-02 (MFG)'];
// The web app hardcodes the Trial Form's branch list to Nidhi Impex regardless
// of the agent's actual company — matched here so both surfaces agree.
const UNIT_OPTIONS = getCompanyUnits('nidhi-impex');

function buildInitialForm(raw) {
  return {
    form_no: raw?.form_no || '',
    trial_date: raw?.trial_date || new Date().toISOString().slice(0, 10),
    department: raw?.department || '',
    designation: raw?.designation || '',
    name: raw?.name || '',
    address: raw?.address || '',
    mobile_number: raw?.mobile_number || '',
    mobile_no_2: raw?.mobile_no_2 || '',
    gender: raw?.gender || 'MALE',
    email: raw?.email || '',
    unit: raw?.unit || '',
    last_company_name: raw?.last_company_name || '',
    last_company_address: raw?.last_company_address || '',
    experience: raw?.experience || '',
    reason_for_leaving: raw?.reason_for_leaving || '',
    hastak_name: raw?.hastak_name || '',
    hastak_code: raw?.hastak_code || '',
    hastak_mobile: raw?.hastak_mobile || '',
    hastak_department: raw?.hastak_department || '',
    contractor: raw?.contractor || '',
    manager_name: raw?.manager_name || '',
    akar: raw?.akar || '',
    emp_signature: raw?.emp_signature || '',
    manager_signature: raw?.manager_signature || '',
    hastak_signature: raw?.hastak_signature || '',
    hr_signature: raw?.hr_signature || '',
    aadhar_card_no: formatAadhaarInput(raw?.aadhaar_full || raw?.aadhar_card_no || ''),
  };
}

export function TrialFormScreen({ initialData, onDone, onCancel }) {
  const { theme } = useTheme();
  const isEditMode = Boolean(initialData?.id);
  const raw = initialData?.raw;
  const readOnly = isEditMode && isCandidateProcessed(raw || {});

  const [form, setForm] = useState(() => buildInitialForm(raw));
  const [photo, setPhoto] = useState(raw?.photo || null);
  const [adharImage, setAdharImage] = useState(raw?.adhar_image || null);
  const [departments, setDepartments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState(null);

  const aadhaarOnFile = Boolean(raw?.aadhaar_full || raw?.aadhaar_masked);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getDepartments();
        if (res?.status && res.data?.length) setDepartments(res.data.map((d) => d.name));
      } catch (e) {
        // Falls back to the default list.
      }
    })();
  }, []);

  const departmentOptions = departments.length ? departments : DEFAULT_DEPARTMENTS;
  const setField = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (key === 'aadhar_card_no') return;
        fd.append(key, value ?? '');
      });
      if (isCompleteAadhaar(form.aadhar_card_no)) {
        fd.append('aadhar_card_no', normaliseAadhaar(form.aadhar_card_no));
      }
      if (photo && typeof photo !== 'string') fd.append('photo', photo);
      if (adharImage && typeof adharImage !== 'string') fd.append('adhar_image', adharImage);

      const res = isEditMode ? await api.updateTrialForm(initialData.id, fd) : await api.submitTrialForm(fd);

      if (res?.status) {
        onDone();
      } else {
        setError(res?.message || 'Could not save this trial form.');
      }
    } catch (e) {
      setError(e.message || 'Could not save this trial form.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const html = buildTrialPrintHtml(raw);
      const { saved } = await downloadPdfToDevice(html, `Trial Form - ${raw?.name || raw?.form_no || ''}`);
      if (saved) Alert.alert('Saved', 'The trial form PDF was saved to your device.');
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
          {readOnly ? 'View Trial Form' : isEditMode ? 'Edit Trial Form' : 'New Trial Form'}
        </Text>

        {readOnly ? (
          <View style={[styles.readOnlyBanner, { backgroundColor: theme.amberBg, borderColor: theme.amber + '40' }]}>
            <Lock size={14} color={theme.amber} />
            <Text style={[styles.readOnlyText, { color: theme.amber }]}>
              This trial form has already been processed into an appointment and can no longer be edited — view only.
            </Text>
          </View>
        ) : null}

        {error ? (
          <Card style={[styles.errorCard, { backgroundColor: theme.roseBg, borderColor: theme.rose + '40' }]}>
            <Text style={{ color: theme.rose }}>{error}</Text>
          </Card>
        ) : null}

        <View pointerEvents={readOnly ? 'none' : 'auto'} style={readOnly && styles.readOnlyContent}>
        <Card style={styles.sectionCard} elevated>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Photo</Text>
          <ImagePickerField label="Candidate Photo" value={photo} onChange={setPhoto} cameraOnly />
        </Card>

        <Card style={styles.sectionCard} elevated>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Candidate Details</Text>
          <FormInput label="Form No" value={form.form_no} onChangeText={setField('form_no')} />
          <DatePickerField label="Trial Date" value={form.trial_date} onChange={setField('trial_date')} />
          <FormInput label="Name of Employee" value={form.name} onChangeText={setField('name')} />
          <FormSelect label="Gender" value={form.gender} onChange={setField('gender')} options={GENDER_OPTIONS} />
          <FormInput label="Address" value={form.address} onChangeText={setField('address')} multiline />
        </Card>

        <Card style={styles.sectionCard} elevated>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Contact</Text>
          <FormInput label="Mobile No 1" value={form.mobile_number} onChangeText={setField('mobile_number')} keyboardType="phone-pad" maxLength={10} />
          <FormInput label="Mobile No 2" value={form.mobile_no_2} onChangeText={setField('mobile_no_2')} keyboardType="phone-pad" maxLength={10} />
          <FormInput label="Email Id" value={form.email} onChangeText={setField('email')} keyboardType="email-address" autoCapitalize="none" />
        </Card>

        <Card style={styles.sectionCard} elevated>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Position</Text>
          <SelectField label="Department" value={form.department} onChange={setField('department')} options={departmentOptions} placeholder="Select department" />
          <FormInput label="Designation" value={form.designation} onChangeText={setField('designation')} />
          <FormSelect label="Branch" value={form.unit} onChange={setField('unit')} options={UNIT_OPTIONS} />
          <FormInput label="Manager Name" value={form.manager_name} onChangeText={setField('manager_name')} />
        </Card>

        <Card style={styles.sectionCard} elevated>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Previous Employment</Text>
          <FormInput label="Last Company Name" value={form.last_company_name} onChangeText={setField('last_company_name')} />
          <FormInput label="Last Company Address" value={form.last_company_address} onChangeText={setField('last_company_address')} />
          <FormInput label="Experience" value={form.experience} onChangeText={setField('experience')} />
          <FormInput label="Reason for Leaving" value={form.reason_for_leaving} onChangeText={setField('reason_for_leaving')} />
        </Card>

        <Card style={styles.sectionCard} elevated>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Hastak / Contractor</Text>
          <FormInput label="Hastak Name" value={form.hastak_name} onChangeText={setField('hastak_name')} />
          <FormInput label="Hastak Code No" value={form.hastak_code} onChangeText={setField('hastak_code')} />
          <FormInput label="Hastak Mobile No" value={form.hastak_mobile} onChangeText={setField('hastak_mobile')} keyboardType="phone-pad" maxLength={10} />
          <FormInput label="Hastak Department/Designation" value={form.hastak_department} onChangeText={setField('hastak_department')} />
          <FormInput label="Contractor" value={form.contractor} onChangeText={setField('contractor')} />
          <FormInput label="Akar" value={form.akar} onChangeText={setField('akar')} />
        </Card>

        <Card style={styles.sectionCard} elevated>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Identity</Text>
          <FormInput
            label="Aadhaar Number"
            value={form.aadhar_card_no}
            onChangeText={(v) => setField('aadhar_card_no')(formatAadhaarInput(v))}
            keyboardType="number-pad"
            maxLength={14}
            disabled={isEditMode}
            helperText={
              isEditMode
                ? aadhaarOnFile
                  ? `On file: ${formatFullAadhaar(raw?.aadhaar_full)}. Cannot be changed once submitted.`
                  : 'No Aadhaar on file.'
                : 'Enter all 12 digits to save an Aadhaar number.'
            }
          />
          <ImagePickerField label="Aadhaar Card Upload" value={adharImage} onChange={setAdharImage} />
        </Card>

        <Card style={styles.sectionCard} elevated>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Signatures</Text>
          <FormInput label="Employee Signature" value={form.emp_signature} onChangeText={setField('emp_signature')} />
          <FormInput label="Manager Signature" value={form.manager_signature} onChangeText={setField('manager_signature')} />
          <FormInput label="Hastak Signature" value={form.hastak_signature} onChangeText={setField('hastak_signature')} />
          <FormInput label="HR Signature" value={form.hr_signature} onChangeText={setField('hr_signature')} />
        </Card>
        </View>

        {!readOnly && (
          <Button
            title={isEditMode ? 'Save Changes' : 'Submit Trial Form'}
            onPress={submit}
            loading={submitting}
            icon={FileText}
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
  readOnlyContent: { opacity: 0.6 },
  errorCard: { padding: 14, marginBottom: 16, borderWidth: 1 },
  sectionCard: { padding: 18, marginBottom: 16 },
  sectionTitle: { ...typography.h4, marginBottom: 14 },
  submitBtn: { marginBottom: 20 },
});
