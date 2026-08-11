import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import {
  DollarSign, Upload, Clock, UserPlus, FileText, Ticket, ShieldCheck, ChevronLeft, ChevronRight,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography, shadows } from '../../theme';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { AgentAppointmentsScreen } from '../agent/AgentAppointmentsScreen';
import { AgentTrialScreen } from '../agent/AgentTrialScreen';
import { AdminSalaryScreen } from './AdminSalaryScreen';
import { AdminSalaryUploadScreen } from './AdminSalaryUploadScreen';
import { AdminShiftsScreen } from './AdminShiftsScreen';
import { AdminTicketsScreen } from './AdminTicketsScreen';
import { AdminAccountsScreen } from './AdminAccountsScreen';

// Web's admin nav has ~12 destinations; the phone tab bar only fits 5, so
// everything beyond Dashboard/Employees/Attendance collapses into this grid
// hub. Tiles are wired to real screens incrementally as each is built —
// anything still a stub renders a "Coming soon" placeholder below.
const TILES = [
  { id: 'salary', label: 'Salary', icon: DollarSign, tint: 'emerald' },
  { id: 'salaryUpload', label: 'Salary Upload', icon: Upload, tint: 'cyan' },
  { id: 'shifts', label: 'Shifts', icon: Clock, tint: 'violet' },
  { id: 'appointments', label: 'Appointments', icon: UserPlus, tint: 'primary' },
  { id: 'trialForms', label: 'Trial Forms', icon: FileText, tint: 'amber' },
  { id: 'tickets', label: 'Tickets', icon: Ticket, tint: 'rose' },
  { id: 'admins', label: 'Manage Admins', icon: ShieldCheck, tint: 'primary', superAdminOnly: true },
];

export function AdminMoreScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [activeHubScreen, setActiveHubScreen] = useState(null);

  const isSuperAdmin = Number(user?.role) === 0;
  const visibleTiles = TILES.filter((t) => !t.superAdminOnly || isSuperAdmin);

  const WIRED_SCREENS = {
    appointments: AgentAppointmentsScreen,
    trialForms: AgentTrialScreen,
    salary: AdminSalaryScreen,
    salaryUpload: AdminSalaryUploadScreen,
    shifts: AdminShiftsScreen,
    tickets: AdminTicketsScreen,
    admins: AdminAccountsScreen,
  };

  if (WIRED_SCREENS[activeHubScreen]) {
    const ScreenComponent = WIRED_SCREENS[activeHubScreen];
    return (
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        <TouchableOpacity style={styles.backRow} onPress={() => setActiveHubScreen(null)} activeOpacity={0.7}>
          <ChevronLeft size={18} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary }]}>More</Text>
        </TouchableOpacity>
        <ScreenComponent />
      </View>
    );
  }

  if (activeHubScreen) {
    const tile = TILES.find((t) => t.id === activeHubScreen);
    return (
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        <TouchableOpacity style={styles.backRow} onPress={() => setActiveHubScreen(null)} activeOpacity={0.7}>
          <ChevronLeft size={18} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary }]}>More</Text>
        </TouchableOpacity>
        <EmptyState icon={tile.icon} title="Coming soon" message={`${tile.label} is being built in a later step of this rollout.`} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>More</Text>
      <View style={styles.grid}>
        {visibleTiles.map((tile) => {
          const Icon = tile.icon;
          const tintColor = theme[tile.tint] || theme.primary;
          const tintBg = theme[`${tile.tint}Bg`] || tintColor + '20';
          return (
            <TouchableOpacity
              key={tile.id}
              activeOpacity={0.75}
              onPress={() => setActiveHubScreen(tile.id)}
              style={styles.tileWrap}
            >
              <Card style={styles.tile} elevated>
                <View style={[styles.iconWrap, { backgroundColor: tintBg }]}>
                  <Icon size={20} color={tintColor} />
                </View>
                <Text style={[styles.tileLabel, { color: theme.textPrimary }]} numberOfLines={2}>
                  {tile.label}
                </Text>
                <ChevronRight size={16} color={theme.textMuted} style={styles.chevron} />
              </Card>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  title: { ...typography.h2, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tileWrap: { width: '47%' },
  tile: { minHeight: 110, justifyContent: 'space-between' },
  iconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  tileLabel: { ...typography.body, fontWeight: '600' },
  chevron: { position: 'absolute', right: 0, top: 0 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 16, marginBottom: 20, marginHorizontal: 16 },
  backText: { ...typography.body, fontWeight: '600' },
});
