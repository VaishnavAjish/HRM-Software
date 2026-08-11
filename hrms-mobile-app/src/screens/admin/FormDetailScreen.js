import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Modal, TextInput, Alert, Platform, StatusBar,
} from 'react-native';
import {
  ChevronLeft, CheckCircle2, XCircle, Edit3, Eye, Printer, User, Phone, Mail, MapPin, Briefcase,
  Building2, CreditCard, ShieldCheck, FileText, Calendar, Hash, Tag, Sparkles, Check, X, Users, Trash2,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography, shadows } from '../../theme';
import { api } from '../../services/api';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Avatar } from '../../components/common/Avatar';
import { formatDate } from '../../utils/format';
import { formatAadhaarInput } from '../../utils/aadhaar';
import { isCandidateApproved } from '../agent/candidateHelpers';
import { AppointmentFormScreen } from '../agent/AppointmentFormScreen';
import { TrialFormScreen } from '../agent/TrialFormScreen';
import { buildAppointmentPrintHtml } from '../../utils/appointmentPrintPdf';
import { buildTrialPrintHtml } from '../../utils/trialPrintPdf';
import { downloadPdfToDevice } from '../../utils/pdf';

function InfoRow({ icon: Icon, label, value }) {
  const { theme } = useTheme();
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoRowLeft}>
        {Icon ? <Icon size={15} color={theme.primary} style={{ marginRight: 8 }} /> : null}
        <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{label}</Text>
      </View>
      <Text style={[styles.infoValue, { color: theme.textPrimary }]} numberOfLines={2}>
        {String(value)}
      </Text>
    </View>
  );
}

function SectionCard({ title, icon: Icon, children }) {
  const { theme } = useTheme();
  return (
    <Card style={styles.sectionCard} elevated>
      <View style={[styles.sectionHeader, { borderBottomColor: theme.border }]}>
        <Icon size={18} color={theme.primary} />
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </Card>
  );
}

export function FormDetailScreen({ candidate, onBack, onChanged, onImmersiveChange }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [mode, setMode] = useState('view'); // 'view' | 'edit'
  const [busy, setBusy] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  // Take over full screen height (removes top app bar & floating bottom bar)
  useEffect(() => {
    onImmersiveChange?.(true);
    return () => onImmersiveChange?.(false);
  }, [onImmersiveChange]);

  const isTrial = candidate?.type === 'trial' || candidate?.form_no !== undefined;
  const approved = isCandidateApproved(candidate);
  const isRejected = candidate?.status === 'Rejected' || candidate?.status === 'rejected';

  // Handle Approve
  const handleApprove = () => {
    Alert.alert(
      'Approve Candidate Form?',
      `Are you sure you want to approve ${candidate?.name || 'this candidate'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setBusy(true);
            try {
              if (isTrial) {
                await api.setTrialFormApproval(candidate.id, true);
              } else {
                await api.request(`/appointment/update/${candidate.id}`, {
                  method: 'POST',
                  body: { status: 'Approved' },
                }).catch(() => null);
              }
              Alert.alert('Form Approved', 'The candidate form has been approved successfully.');
              onChanged?.();
              onBack?.();
            } catch (e) {
              Alert.alert('Could not approve', e?.message || 'Please try again.');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  // Handle Reject
  const handleRejectSubmit = async () => {
    if (!rejectionReason.trim()) {
      Alert.alert('Reason Required', 'Please enter a reason for rejection.');
      return;
    }
    setRejectModalOpen(false);
    setBusy(true);
    try {
      if (isTrial) {
        await api.setTrialFormApproval(candidate.id, false);
      } else {
        await api.request(`/appointment/update/${candidate.id}`, {
          method: 'POST',
          body: { status: 'Rejected', rejection_reason: rejectionReason.trim() },
        }).catch(() => null);
      }
      Alert.alert('Form Rejected', 'The candidate form status has been updated to Rejected.');
      onChanged?.();
      onBack?.();
    } catch (e) {
      Alert.alert('Could not reject', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // Handle Delete
  const handleDelete = () => {
    Alert.alert(
      'Delete Candidate Form?',
      `Are you sure you want to PERMANENTLY DELETE ${candidate?.name || 'this candidate form'}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Form',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              if (isTrial) {
                await api.deleteTrialForm(candidate.id);
              } else {
                await api.deleteAppointment(candidate.id).catch(() => null);
              }
              Alert.alert('Form Deleted', 'The candidate form has been deleted permanently.');
              onChanged?.();
              onBack?.();
            } catch (e) {
              Alert.alert('Could not delete', e?.message || 'Please try again.');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  // Export PDF
  const handleExportPdf = async () => {
    try {
      const html = isTrial
        ? buildTrialPrintHtml(candidate, user?.name)
        : buildAppointmentPrintHtml(candidate, user?.name);
      await downloadPdfToDevice(html, `${candidate?.name || 'Form'}-${isTrial ? 'Trial' : 'Appointment'}.pdf`);
    } catch (e) {
      Alert.alert('PDF Export Failed', e?.message || 'Could not export form PDF.');
    }
  };

  if (mode === 'edit') {
    if (isTrial) {
      return (
        <TrialFormScreen
          initialData={candidate}
          onDone={() => { setMode('view'); onChanged?.(); }}
          onCancel={() => setMode('view')}
        />
      );
    }
    return (
      <AppointmentFormScreen
        initialData={candidate}
        onDone={() => { setMode('view'); onChanged?.(); }}
        onCancel={() => setMode('view')}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* Top Header with Safe Notch Padding */}
      <View style={[styles.header, { backgroundColor: theme.surfaceCard, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={10}>
          <ChevronLeft size={24} color={theme.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerName, { color: theme.textPrimary }]} numberOfLines={1}>
            {candidate?.name || 'Candidate Details'}
          </Text>
          <Text style={[styles.headerSub, { color: theme.textMuted }]}>
            {isTrial ? 'Trial Form' : 'Appointment Form'} {candidate?.emp_code ? `· #${candidate.emp_code}` : ''}
          </Text>
        </View>

        <TouchableOpacity onPress={handleExportPdf} style={styles.exportBtn} hitSlop={8}>
          <Printer size={20} color={theme.primary} />
        </TouchableOpacity>
      </View>



      {/* Main Form Content */}
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Candidate Summary Card */}
        <Card style={styles.summaryCard} elevated>
          <View style={styles.summaryLeft}>
            <Avatar name={candidate?.name} uri={candidate?.photo} size={64} />
            <View style={styles.summaryInfo}>
              <Text style={[styles.summaryName, { color: theme.textPrimary }]}>
                {candidate?.name || 'Unnamed Candidate'}
              </Text>
              <Text style={[styles.summaryRole, { color: theme.textMuted }]}>
                {candidate?.designation || candidate?.department || 'Intake Candidate'}
              </Text>

              <View style={styles.badgeRow}>
                <Badge
                  label={isTrial ? 'Trial Form' : 'Appointment'}
                  variant={isTrial ? 'amber' : 'emerald'}
                  size="small"
                />
                <Badge
                  label={isRejected ? 'Rejected' : approved ? 'Approved' : 'Pending Approval'}
                  variant={isRejected ? 'rose' : approved ? 'emerald' : 'amber'}
                  size="small"
                />
              </View>
            </View>
          </View>
        </Card>

        {/* 1. Job & Placement Details */}
        <SectionCard title="Job & Placement Info" icon={Briefcase}>
          <InfoRow icon={Building2} label="Department" value={candidate?.department} />
          <InfoRow icon={Briefcase} label="Designation" value={candidate?.designation} />
          <InfoRow icon={User} label="Reporting Manager" value={candidate?.manager_name} />
          <InfoRow icon={Calendar} label="Joining Date" value={candidate?.joining_date ? formatDate(candidate.joining_date) : null} />
          <InfoRow icon={Tag} label="Company Code" value={candidate?.company_code} />
          <InfoRow icon={Building2} label="Unit / Branch" value={candidate?.unit} />
          <InfoRow icon={Hash} label="Employee Code" value={candidate?.emp_code} />
          <InfoRow icon={Hash} label="Punching No" value={candidate?.punching_no} />
          <InfoRow icon={CreditCard} label="Offered Salary" value={candidate?.salary ? `₹${candidate.salary}` : null} />
        </SectionCard>

        {/* 2. Personal Information */}
        <SectionCard title="Personal Information" icon={User}>
          <InfoRow icon={User} label="Full Name" value={candidate?.name} />
          <InfoRow icon={Calendar} label="Date of Birth" value={candidate?.dob ? formatDate(candidate.dob) : null} />
          <InfoRow icon={User} label="Gender" value={candidate?.gender} />
          <InfoRow icon={User} label="Marital Status" value={candidate?.marital_status} />
          <InfoRow icon={User} label="Blood Group" value={candidate?.blood_group} />
          <InfoRow icon={User} label="Cast" value={candidate?.cast} />
          <InfoRow icon={MapPin} label="Birth Place" value={candidate?.birth_place} />
        </SectionCard>

        {/* 3. Contact & Location */}
        <SectionCard title="Contact & Location" icon={Phone}>
          <InfoRow icon={Phone} label="Mobile Number" value={candidate?.mobile_number} />
          <InfoRow icon={Phone} label="Secondary / WhatsApp" value={candidate?.emp_whatsapp_no || candidate?.mobile_no_2} />
          <InfoRow icon={Mail} label="Email Address" value={candidate?.email} />
          <InfoRow icon={MapPin} label="Residential Address" value={candidate?.address} />
          <InfoRow icon={MapPin} label="Village" value={candidate?.village} />
          <InfoRow icon={MapPin} label="Taluka" value={candidate?.taluka} />
          <InfoRow icon={MapPin} label="District" value={candidate?.district} />
        </SectionCard>

        {/* 4. Experience & Past Employer */}
        {(candidate?.last_company_name || candidate?.experience) ? (
          <SectionCard title="Experience & Previous Employer" icon={Briefcase}>
            <InfoRow icon={Building2} label="Previous Company" value={candidate?.last_company_name} />
            <InfoRow icon={MapPin} label="Company Address" value={candidate?.last_company_address} />
            <InfoRow icon={Briefcase} label="Total Experience" value={candidate?.experience} />
            <InfoRow icon={FileText} label="Reason for Leaving" value={candidate?.reason_for_leaving} />
          </SectionCard>
        ) : null}

        {/* 5. Reference & Hastak Info */}
        {(candidate?.reference_name || candidate?.hastak_name) ? (
          <SectionCard title="Reference & Hastak Details" icon={Users}>
            <InfoRow icon={User} label="Reference Name" value={candidate?.reference_name} />
            <InfoRow icon={Phone} label="Reference Mobile" value={candidate?.reference_mobile_no} />
            <InfoRow icon={User} label="Hastak Name" value={candidate?.hastak_name} />
            <InfoRow icon={Hash} label="Hastak Code" value={candidate?.hastak_code} />
            <InfoRow icon={Phone} label="Hastak Mobile" value={candidate?.hastak_mobile} />
            <InfoRow icon={Building2} label="Hastak Department" value={candidate?.hastak_department} />
            <InfoRow icon={User} label="Contractor" value={candidate?.contractor} />
          </SectionCard>
        ) : null}

        {/* 6. Identity & Financial Info */}
        <SectionCard title="Identity & Banking" icon={ShieldCheck}>
          <InfoRow icon={ShieldCheck} label="Aadhaar Card" value={candidate?.aadhaar_full || candidate?.aadhar_card_no ? formatAadhaarInput(candidate?.aadhaar_full || candidate?.aadhar_card_no) : null} />
          <InfoRow icon={ShieldCheck} label="PAN Card" value={candidate?.pan_card_no} />
          <InfoRow icon={Building2} label="Bank Name" value={candidate?.bank_name} />
          <InfoRow icon={CreditCard} label="Account Number" value={candidate?.bank_account_no} />
          <InfoRow icon={Hash} label="IFSC Code" value={candidate?.bank_ifsc_code} />
          <InfoRow icon={FileText} label="Highest Education" value={candidate?.education} />
        </SectionCard>
      </ScrollView>

      {/* Practical Admin Action Footer Bar */}
      <View style={[styles.footerBar, { backgroundColor: theme.surfaceCard, borderTopColor: theme.border }]}>
        <View style={styles.footerBtnGroup}>
          {!approved ? (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme.emerald }]}
              onPress={handleApprove}
              disabled={busy}
              activeOpacity={0.8}
            >
              <CheckCircle2 size={15} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>Approve</Text>
            </TouchableOpacity>
          ) : null}

          {!isRejected ? (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme.rose }]}
              onPress={() => setRejectModalOpen(true)}
              disabled={busy}
              activeOpacity={0.8}
            >
              <XCircle size={15} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>Reject</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: theme.surfaceElevated, borderColor: theme.border, borderWidth: 1 }]}
            onPress={handleDelete}
            disabled={busy}
            activeOpacity={0.8}
          >
            <Trash2 size={15} color={theme.rose} />
            <Text style={[styles.actionBtnText, { color: theme.rose }]}>Delete</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: theme.primary }]}
            onPress={() => setMode('edit')}
            disabled={busy}
            activeOpacity={0.8}
          >
            <Edit3 size={15} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>Edit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Reject Modal */}
      <Modal visible={rejectModalOpen} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setRejectModalOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setRejectModalOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.modalSheet, { backgroundColor: theme.surfaceCard, borderColor: theme.border }, shadows.glass]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Reject Candidate Form</Text>
              <TouchableOpacity onPress={() => setRejectModalOpen(false)} hitSlop={8}>
                <X size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSub, { color: theme.textMuted }]}>
              Please state the reason for rejecting {candidate?.name}'s form:
            </Text>

            <TextInput
              style={[styles.reasonInput, { color: theme.textPrimary, backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
              placeholder="e.g. Incomplete Aadhaar details, failed background verification..."
              placeholderTextColor={theme.textMuted}
              value={rejectionReason}
              onChangeText={setRejectionReason}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.surfaceElevated }]} onPress={() => setRejectModalOpen(false)}>
                <Text style={[styles.modalBtnText, { color: theme.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.rose }]} onPress={handleRejectSubmit}>
                <Text style={[styles.modalBtnText, { color: '#FFFFFF' }]}>Confirm Reject</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 36) + 6 : 50,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { marginRight: 10 },
  headerTitleWrap: { flex: 1 },
  headerName: { ...typography.h3, fontWeight: '800' },
  headerSub: { ...typography.micro, marginTop: 2 },
  exportBtn: { padding: 6 },

  tabRow: { flexDirection: 'row', padding: 6, borderBottomWidth: 1, gap: 8 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 6,
  },
  tabText: { ...typography.caption, fontWeight: '700' },

  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 100 },

  summaryCard: { padding: 16, borderRadius: 20, marginBottom: 14 },
  summaryLeft: { flexDirection: 'row', alignItems: 'center' },
  summaryInfo: { flex: 1, marginLeft: 14 },
  summaryName: { ...typography.h3, fontWeight: '800' },
  summaryRole: { ...typography.caption, marginTop: 2, marginBottom: 8 },
  badgeRow: { flexDirection: 'row', gap: 6 },

  sectionCard: { marginBottom: 14, padding: 16, borderRadius: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottomWidth: 1, marginBottom: 10 },
  sectionTitle: { ...typography.h4, fontWeight: '700' },
  sectionBody: { gap: 10 },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoRowLeft: { flexDirection: 'row', alignItems: 'center' },
  infoLabel: { ...typography.caption, fontWeight: '600' },
  infoValue: { ...typography.body, fontWeight: '700', flex: 1, textAlign: 'right', marginLeft: 10 },

  footerBar: { paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1 },
  footerBtnGroup: { flexDirection: 'row', gap: 6 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 4,
  },
  actionBtnText: { ...typography.micro, fontWeight: '800', color: '#FFFFFF' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalSheet: { width: '88%', padding: 20, borderRadius: 20, borderWidth: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { ...typography.h3, fontWeight: '800' },
  modalSub: { ...typography.caption, marginBottom: 12 },
  reasonInput: { borderWidth: 1, borderRadius: 14, padding: 12, fontSize: 14, textAlignVertical: 'top', height: 90, marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalBtnText: { ...typography.caption, fontWeight: '800' },
});
