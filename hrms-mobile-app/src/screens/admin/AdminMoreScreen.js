import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import {
  User, CalendarCheck, Clock, Ticket, ShieldCheck, ChevronLeft, ChevronRight, Building2, MapPin, LogOut
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography, shadows } from '../../theme';
import { Card } from '../../components/common/Card';
import { Avatar } from '../../components/common/Avatar';
import { Badge } from '../../components/common/Badge';
import { ProfileScreen } from '../ProfileScreen';
import { AdminAttendanceScreen } from './AdminAttendanceScreen';
import { AdminShiftsScreen } from './AdminShiftsScreen';
import { AdminTicketsScreen } from './AdminTicketsScreen';
import { AdminAccountsScreen } from './AdminAccountsScreen';

export function AdminMoreScreen() {
  const { theme } = useTheme();
  const { user, role, logout } = useAuth();
  const [activeSubScreen, setActiveSubScreen] = useState(null); // null | 'profile' | 'attendance' | 'shifts' | 'tickets' | 'accounts'

  const isSuperAdmin = Number(user?.role) === 0;

  if (activeSubScreen === 'profile') {
    return <ProfileScreen onBack={() => setActiveSubScreen(null)} />;
  }

  if (activeSubScreen === 'attendance') {
    return <AdminAttendanceScreen onBack={() => setActiveSubScreen(null)} />;
  }

  if (activeSubScreen === 'shifts') {
    return <AdminShiftsScreen onBack={() => setActiveSubScreen(null)} />;
  }

  if (activeSubScreen === 'tickets') {
    return <AdminTicketsScreen onBack={() => setActiveSubScreen(null)} />;
  }

  if (activeSubScreen === 'accounts') {
    return <AdminAccountsScreen onBack={() => setActiveSubScreen(null)} />;
  }

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>More Options</Text>

      {/* Admin Profile Card */}
      <TouchableOpacity activeOpacity={0.9} onPress={() => setActiveSubScreen('profile')}>
        <Card style={styles.profileCard} elevated>
          <View style={styles.profileHeader}>
            <Avatar name={user?.name} uri={user?.photo} size={54} />
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <Text style={[styles.profileName, { color: theme.textPrimary }]} numberOfLines={1}>
                  {user?.name || 'Admin User'}
                </Text>
                <Badge label={isSuperAdmin ? 'Super Admin' : 'Admin'} variant={isSuperAdmin ? 'rose' : 'primary'} size="small" />
              </View>
              <Text style={[styles.profileEmail, { color: theme.textMuted }]} numberOfLines={1}>
                {user?.email || 'admin@company.com'}
              </Text>
              <Text style={[styles.profileMeta, { color: theme.textMuted }]} numberOfLines={1}>
                {[user?.company_code, user?.unit].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <ChevronRight size={20} color={theme.textMuted} />
          </View>
          <View style={[styles.viewProfileBtn, { backgroundColor: theme.primary + '10' }]}>
            <Text style={[styles.viewProfileText, { color: theme.primary }]}>View & Edit Full Profile</Text>
          </View>
        </Card>
      </TouchableOpacity>

      {/* Admin Operations List */}
      <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Admin Control Center</Text>

      <Card style={styles.menuCard} elevated>
        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => setActiveSubScreen('profile')}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIconWrap, { backgroundColor: theme.primary + '15' }]}>
            <User size={18} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.menuTitle, { color: theme.textPrimary }]}>My Profile & Account</Text>
            <Text style={[styles.menuSub, { color: theme.textMuted }]}>Personal info, photo, and security</Text>
          </View>
          <ChevronRight size={18} color={theme.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => setActiveSubScreen('attendance')}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIconWrap, { backgroundColor: theme.emerald + '15' }]}>
            <CalendarCheck size={18} color={theme.emerald} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.menuTitle, { color: theme.textPrimary }]}>Attendance Logs</Text>
            <Text style={[styles.menuSub, { color: theme.textMuted }]}>Daily attendance grids & overrides</Text>
          </View>
          <ChevronRight size={18} color={theme.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => setActiveSubScreen('shifts')}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIconWrap, { backgroundColor: theme.violet + '15' }]}>
            <Clock size={18} color={theme.violet} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.menuTitle, { color: theme.textPrimary }]}>Shifts & Rosters</Text>
            <Text style={[styles.menuSub, { color: theme.textMuted }]}>Shift schedules and employee assignments</Text>
          </View>
          <ChevronRight size={18} color={theme.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => setActiveSubScreen('tickets')}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIconWrap, { backgroundColor: theme.rose + '15' }]}>
            <Ticket size={18} color={theme.rose} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.menuTitle, { color: theme.textPrimary }]}>Helpdesk Tickets</Text>
            <Text style={[styles.menuSub, { color: theme.textMuted }]}>Respond to and resolve support issues</Text>
          </View>
          <ChevronRight size={18} color={theme.textMuted} />
        </TouchableOpacity>

        {isSuperAdmin ? (
          <TouchableOpacity
            style={[styles.menuRow, { borderBottomWidth: 0 }]}
            onPress={() => setActiveSubScreen('accounts')}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: theme.amber + '15' }]}>
              <ShieldCheck size={18} color={theme.amber} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuTitle, { color: theme.textPrimary }]}>Manage Admins</Text>
              <Text style={[styles.menuSub, { color: theme.textMuted }]}>Create admin accounts and assign permissions</Text>
            </View>
            <ChevronRight size={18} color={theme.textMuted} />
          </TouchableOpacity>
        ) : null}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  title: { ...typography.h2, marginBottom: 16 },
  sectionTitle: { ...typography.h4, marginTop: 20, marginBottom: 10 },
  profileCard: { padding: 16, marginBottom: 8 },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  profileName: { ...typography.h4, flexShrink: 1 },
  profileEmail: { ...typography.caption },
  profileMeta: { ...typography.micro, marginTop: 2 },
  viewProfileBtn: { marginTop: 14, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  viewProfileText: { ...typography.caption, fontWeight: '700' },
  menuCard: { paddingHorizontal: 16, paddingVertical: 4 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  menuIconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  menuTitle: { ...typography.body, fontWeight: '700' },
  menuSub: { ...typography.micro, marginTop: 2 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 16, marginBottom: 12, marginHorizontal: 16 },
  backText: { ...typography.body, fontWeight: '600' },
});
