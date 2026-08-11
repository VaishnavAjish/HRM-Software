import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FileCheck, UserPlus, FileText } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme';
import { AdminAppointmentsList } from '../agent/AgentAppointmentsScreen';
import { AdminTrialList } from '../agent/AgentTrialScreen';
import { CandidateCard } from '../../components/agent/CandidateCard';

export function AdminFormsScreen() {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState('appointments'); // 'appointments' | 'trial'
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  if (selectedCandidate) {
    return (
      <CandidateCard
        candidate={selectedCandidate}
        onBack={() => setSelectedCandidate(null)}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.headerArea}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Forms & Intake</Text>
        
        {/* Toggle Bar */}
        <View style={[styles.tabBar, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeTab === 'appointments' && { backgroundColor: theme.primary, borderRadius: 10 },
            ]}
            onPress={() => setActiveTab('appointments')}
            activeOpacity={0.8}
          >
            <UserPlus size={15} color={activeTab === 'appointments' ? '#FFFFFF' : theme.textMuted} />
            <Text style={[styles.tabText, { color: activeTab === 'appointments' ? '#FFFFFF' : theme.textMuted }]}>
              Appointments
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeTab === 'trial' && { backgroundColor: theme.primary, borderRadius: 10 },
            ]}
            onPress={() => setActiveTab('trial')}
            activeOpacity={0.8}
          >
            <FileText size={15} color={activeTab === 'trial' ? '#FFFFFF' : theme.textMuted} />
            <Text style={[styles.tabText, { color: activeTab === 'trial' ? '#FFFFFF' : theme.textMuted }]}>
              Trial Forms
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {activeTab === 'appointments' ? (
          <AdminAppointmentsList onOpen={(candidate) => setSelectedCandidate(candidate)} />
        ) : (
          <AdminTrialList onOpen={(candidate) => setSelectedCandidate(candidate)} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerArea: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  title: { ...typography.h2, marginBottom: 12 },
  tabBar: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  tabText: { ...typography.caption, fontWeight: '700' },
});
