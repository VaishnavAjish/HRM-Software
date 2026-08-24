import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, BackHandler } from 'react-native';
import {
  Ticket, Users, ShieldCheck, Calculator, CalendarCheck, ChevronRight, ChevronLeft
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography } from '../../theme';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { AdminTicketsScreen } from './AdminTicketsScreen';
import { AdminHrScreen } from './AdminHrScreen';
import { AdminAccountsScreen } from './AdminAccountsScreen';

export function AdminMoreScreen({ onNavigateTab, onImmersiveChange }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [activeSubScreen, setActiveSubScreen] = useState(null);

  // Handle Hardware Back Button
  useEffect(() => {
    if (activeSubScreen) {
      const onBackPress = () => {
        setActiveSubScreen(null);
        return true;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }
  }, [activeSubScreen]);

  if (activeSubScreen === 'ticket') {
    return <AdminTicketsScreen onBack={() => setActiveSubScreen(null)} onImmersiveChange={onImmersiveChange} />;
  }

  if (activeSubScreen === 'hr') {
    return <AdminHrScreen onBack={() => setActiveSubScreen(null)} onNavigateTab={onNavigateTab} />;
  }

  if (activeSubScreen === 'access') {
    return <AdminAccountsScreen onBack={() => setActiveSubScreen(null)} />;
  }

  if (activeSubScreen === 'tds') {
    return (
      <View style={[styles.screen, { backgroundColor: theme.background, padding: 16 }]}>
        <TouchableOpacity style={styles.backRow} onPress={() => setActiveSubScreen(null)} activeOpacity={0.7}>
          <ChevronLeft size={18} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary }]}>Back to More</Text>
        </TouchableOpacity>
        <EmptyState
          icon={Calculator}
          title="TDS Module Coming Soon"
          message="Tax Deduction at Source calculations, PAN declarations & Form 16 reports are coming soon in an upcoming update."
        />
      </View>
    );
  }

  if (activeSubScreen === 'attendance') {
    return (
      <View style={[styles.screen, { backgroundColor: theme.background, padding: 16 }]}>
        <TouchableOpacity style={styles.backRow} onPress={() => setActiveSubScreen(null)} activeOpacity={0.7}>
          <ChevronLeft size={18} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary }]}>Back to More</Text>
        </TouchableOpacity>
        <EmptyState
          icon={CalendarCheck}
          title="Attendance Module Coming Soon"
          message="Daily attendance logs, punches, shift timings & overrides are coming soon in an upcoming update."
        />
      </View>
    );
  }

  const OPTIONS = [
    {
      id: 'ticket',
      title: 'Ticket',
      subtitle: 'Helpdesk support tickets & issue resolution',
      icon: Ticket,
      color: theme.rose,
    },
    {
      id: 'hr',
      title: 'HR',
      subtitle: 'Human Resource Operations, hiring, onboarding & assets',
      icon: Users,
      color: '#3B82F6',
    },
    {
      id: 'access',
      title: 'Access Control',
      subtitle: 'Admin accounts, permission levels & role policies',
      icon: ShieldCheck,
      color: '#8B5CF6',
    },
    {
      id: 'tds',
      title: 'TDS',
      subtitle: 'Tax Deduction at Source, declarations & reports',
      icon: Calculator,
      color: '#10B981',
    },
    {
      id: 'attendance',
      title: 'Attendance',
      subtitle: 'Daily attendance logs, punches & overrides',
      icon: CalendarCheck,
      color: '#F59E0B',
    },
  ];

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>More Options</Text>
      <Text style={[styles.subtitle, { color: theme.textMuted }]}>
        Select an administrative module below to manage organization operations
      </Text>

      <Card style={styles.menuCard} elevated>
        {OPTIONS.map((opt, idx) => {
          const Icon = opt.icon;
          const isLast = idx === OPTIONS.length - 1;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[
                styles.menuRow,
                !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
              ]}
              onPress={() => setActiveSubScreen(opt.id)}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconWrap, { backgroundColor: opt.color + '18' }]}>
                <Icon size={20} color={opt.color} />
              </View>

              <View style={styles.menuTextWrap}>
                <Text style={[styles.menuTitle, { color: theme.textPrimary }]}>{opt.title}</Text>
                <Text style={[styles.menuSub, { color: theme.textMuted }]}>{opt.subtitle}</Text>
              </View>

              <ChevronRight size={18} color={theme.textMuted} />
            </TouchableOpacity>
          );
        })}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  backText: { ...typography.body, fontWeight: '600' },
  title: { ...typography.h2, fontWeight: '800' },
  subtitle: { ...typography.caption, marginTop: 2, marginBottom: 16 },
  menuCard: { paddingHorizontal: 16, paddingVertical: 4 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
  },
  menuIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTextWrap: {
    flex: 1,
  },
  menuTitle: {
    ...typography.body,
    fontWeight: '800',
    fontSize: 15,
  },
  menuSub: {
    ...typography.micro,
    marginTop: 2,
  },
});
