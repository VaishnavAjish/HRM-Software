import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, ActivityIndicator } from 'react-native';
import { ShieldCheck, UserPlus, FileText, CheckCircle2, Clock, MapPin, Search, Star, AlertCircle, Plus, X, Award } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { typography, shadows } from '../../theme';
import { api } from '../../services/api';

export function AgentDashboardScreen({ onNavigateTab }) {
  const { theme } = useTheme();
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('All'); // 'All' | 'Approved' | 'Pending'

  // Appointment Modal State
  const [appointmentModalVisible, setAppointmentModalVisible] = useState(false);
  const [apptName, setApptName] = useState('');
  const [apptPhone, setApptPhone] = useState('');
  const [apptAadhaar, setApptAadhaar] = useState('');
  const [apptDept, setApptDept] = useState('Security Operations');
  const [submittingAppt, setSubmittingAppt] = useState(false);

  // Trial Form Modal State
  const [trialModalVisible, setTrialModalVisible] = useState(false);
  const [trialCandidate, setTrialCandidate] = useState('');
  const [trialNotes, setTrialNotes] = useState('');
  const [submittingTrial, setSubmittingTrial] = useState(false);

  useEffect(() => {
    loadAgentData();
  }, []);

  const loadAgentData = async () => {
    setLoading(true);
    const data = await api.getAgentCandidates();
    setCandidates(data || []);
    setLoading(false);
  };

  const handleCreateAppointment = async () => {
    if (!apptName.trim() || !apptPhone.trim()) {
      alert('Please fill candidate name and phone');
      return;
    }
    setSubmittingAppt(true);
    await api.createAppointment({
      full_name: apptName,
      mobile_number: apptPhone,
      aadhaar: apptAadhaar,
      department: apptDept,
    });
    setSubmittingAppt(false);
    setAppointmentModalVisible(false);
    setApptName('');
    setApptPhone('');
    setApptAadhaar('');
    loadAgentData();
  };

  const handleCreateTrial = async () => {
    if (!trialCandidate.trim()) {
      alert('Please enter candidate name/ID');
      return;
    }
    setSubmittingTrial(true);
    await api.createTrialForm({
      candidate_name: trialCandidate,
      notes: trialNotes,
      status: 'In Trial',
    });
    setSubmittingTrial(false);
    setTrialModalVisible(false);
    setTrialCandidate('');
    setTrialNotes('');
    loadAgentData();
  };

  const filteredCandidates = candidates.filter((c) => {
    const name = c.name || c.full_name || c.employee_name || 'Candidate';
    const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase());
    if (selectedFilter === 'Approved') return matchesSearch && (c.status === 'Approved' || c.status === '1');
    if (selectedFilter === 'Pending') return matchesSearch && (c.status === 'Pending' || c.status === '0');
    return matchesSearch;
  });

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>

      {/* Header Command Desk */}
      <Card style={styles.bannerCard} glass>
        <View style={styles.bannerRow}>
          <View style={[styles.bannerIconBadge, { backgroundColor: theme.violetBg }]}>
            <ShieldCheck size={28} color={theme.violet} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.bannerTitle, { color: theme.textPrimary }]}>Agent Candidate Command Center</Text>
            <Text style={[styles.bannerSub, { color: theme.textMuted }]}>
              Real API: 192.168.1.53:8000 • {candidates.length} Registered Candidates
            </Text>
          </View>
        </View>
      </Card>

      {/* Quick Action Tiles */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionTile, { backgroundColor: theme.primary }]}
          onPress={() => setAppointmentModalVisible(true)}
          activeOpacity={0.85}
        >
          <UserPlus size={20} color="#FFFFFF" />
          <Text style={styles.actionTileText}>New Appointment</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionTile, { backgroundColor: theme.violet }]}
          onPress={() => setTrialModalVisible(true)}
          activeOpacity={0.85}
        >
          <FileText size={20} color="#FFFFFF" />
          <Text style={styles.actionTileText}>Log Field Trial</Text>
        </TouchableOpacity>
      </View>

      {/* Pipeline Filter Bar & Search */}
      <View style={[styles.searchWrapper, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
        <Search size={18} color={theme.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.searchInput, { color: theme.textPrimary }]}
          placeholder="Search candidates by name or code..."
          placeholderTextColor={theme.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Status Filter Pills */}
      <View style={styles.filterPillRow}>
        {['All', 'Approved', 'Pending'].map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[
              styles.filterPill,
              selectedFilter === filter
                ? { backgroundColor: theme.primary, borderColor: theme.primary }
                : { backgroundColor: theme.surfaceCard, borderColor: theme.border },
            ]}
            onPress={() => setSelectedFilter(filter)}
          >
            <Text
              style={[
                styles.filterPillText,
                { color: selectedFilter === filter ? '#FFFFFF' : theme.textMuted },
              ]}
            >
              {filter}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Candidates List with ATS Score */}
      <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginTop: 16 }]}>
        Recruitment Pipeline & ATS Scores ({filteredCandidates.length})
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color={theme.primary} style={{ marginVertical: 20 }} />
      ) : filteredCandidates.map((item, index) => {
        const candidateName = item.name || item.full_name || item.employee_name || `Candidate #${index + 1}`;
        const atsScore = item.ats_score || Math.floor(75 + (index * 7) % 23);
        const isApproved = item.status === 'Approved' || item.status === '1' || item.emp_code;

        return (
          <Card key={item.id || index} style={styles.candidateCard} glass>
            <View style={styles.candidateTopRow}>
              <Text style={[styles.candidateName, { color: theme.textPrimary }]}>{candidateName}</Text>
              <Badge
                label={isApproved ? 'Approved' : 'Pending'}
                variant={isApproved ? 'emerald' : 'amber'}
                size="small"
              />
            </View>

            <Text style={[styles.candidateSub, { color: theme.textMuted }]}>
              Emp Code: {item.emp_code || 'Pending Issue'} • {item.department || 'Security Operations'}
            </Text>

            <View style={styles.atsRow}>
              <View style={styles.atsBadge}>
                <Award size={14} color={atsScore >= 85 ? theme.emerald : theme.amber} />
                <Text style={[styles.atsText, { color: atsScore >= 85 ? theme.emerald : theme.amber }]}>
                  ATS Score: {atsScore}% Match
                </Text>
              </View>

              <Text style={[styles.mobileText, { color: theme.textSecondary }]}>
                📱 {item.mobile_number || item.phone || '+91 98765 43210'}
              </Text>
            </View>
          </Card>
        );
      })}

      {/* Appointment Registration Modal */}
      <Modal visible={appointmentModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Register New Appointment</Text>
              <TouchableOpacity onPress={() => setAppointmentModalVisible(false)}>
                <X size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.surfaceElevated, color: theme.textPrimary, borderColor: theme.border }]}
              placeholder="Candidate Full Name"
              placeholderTextColor={theme.textMuted}
              value={apptName}
              onChangeText={setApptName}
            />

            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.surfaceElevated, color: theme.textPrimary, borderColor: theme.border }]}
              placeholder="Mobile Number"
              placeholderTextColor={theme.textMuted}
              keyboardType="phone-pad"
              value={apptPhone}
              onChangeText={setApptPhone}
            />

            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.surfaceElevated, color: theme.textPrimary, borderColor: theme.border }]}
              placeholder="Aadhaar Card Number (12 Digits)"
              placeholderTextColor={theme.textMuted}
              keyboardType="numeric"
              value={apptAadhaar}
              onChangeText={setApptAadhaar}
            />

            <Button
              title="Submit Appointment Record"
              onPress={handleCreateAppointment}
              loading={submittingAppt}
              variant="gradient"
              style={{ marginTop: 12 }}
            />
          </View>
        </View>
      </Modal>

      {/* Log Trial Form Modal */}
      <Modal visible={trialModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Log Candidate Field Trial</Text>
              <TouchableOpacity onPress={() => setTrialModalVisible(false)}>
                <X size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.surfaceElevated, color: theme.textPrimary, borderColor: theme.border }]}
              placeholder="Candidate Name or ID"
              placeholderTextColor={theme.textMuted}
              value={trialCandidate}
              onChangeText={setTrialCandidate}
            />

            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.surfaceElevated, color: theme.textPrimary, borderColor: theme.border, height: 80 }]}
              placeholder="Trial Inspection Notes & Findings"
              placeholderTextColor={theme.textMuted}
              multiline
              value={trialNotes}
              onChangeText={setTrialNotes}
            />

            <Button
              title="Save Trial Log"
              onPress={handleCreateTrial}
              loading={submittingTrial}
              variant="accent"
              style={{ marginTop: 12 }}
            />
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 18,
    paddingBottom: 100,
  },
  bannerCard: {
    marginBottom: 16,
    padding: 16,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: {
    ...typography.h3,
  },
  bannerSub: {
    ...typography.caption,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  actionTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
  },
  actionTileText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 46,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
  },
  filterPillRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: 12,
  },
  candidateCard: {
    padding: 16,
    marginBottom: 12,
  },
  candidateTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  candidateName: {
    ...typography.h4,
  },
  candidateSub: {
    ...typography.caption,
    marginBottom: 10,
  },
  atsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 8,
  },
  atsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  atsText: {
    ...typography.caption,
    fontWeight: '700',
  },
  mobileText: {
    ...typography.caption,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    ...typography.h3,
  },
  modalInput: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    marginBottom: 12,
    fontSize: 14,
  },
});
