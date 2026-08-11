import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { UserPlus, FileText, CheckCircle2, Clock, XCircle, Users } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme';
import { AdminAppointmentsList } from '../agent/AgentAppointmentsScreen';
import { AdminTrialList } from '../agent/AgentTrialScreen';
import { FormDetailScreen } from './FormDetailScreen';

export function AdminFormsScreen({ onImmersiveChange }) {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState('appointments'); // 'appointments' | 'trial'
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  if (selectedCandidate) {
    return (
      <FormDetailScreen
        candidate={selectedCandidate}
        onBack={() => setSelectedCandidate(null)}
        onChanged={() => setSelectedCandidate(null)}
        onImmersiveChange={onImmersiveChange}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.headerArea}>
        {/* Executive Segmented Toggle Bar */}
        <View style={[styles.tabBar, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeTab === 'appointments' && { backgroundColor: theme.primary, borderRadius: 12 },
            ]}
            onPress={() => setActiveTab('appointments')}
            activeOpacity={0.8}
          >
            <UserPlus size={15} color={activeTab === 'appointments' ? '#FFFFFF' : theme.textMuted} />
            <Text style={[styles.tabText, { color: activeTab === 'appointments' ? '#FFFFFF' : theme.textMuted }]}>
              Appointment Forms
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeTab === 'trial' && { backgroundColor: theme.primary, borderRadius: 12 },
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
          <AdminAppointmentsList onOpen={(candidate) => setSelectedCandidate({ ...candidate, type: 'appointment' })} />
        ) : (
          <AdminTrialList onOpen={(candidate) => setSelectedCandidate({ ...candidate, type: 'trial' })} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerArea: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  title: { ...typography.h2, fontWeight: '800', marginBottom: 10 },
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
