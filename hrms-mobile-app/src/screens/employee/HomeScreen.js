import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Wallet, CalendarCheck, FileText, ChevronRight, Ticket, User, AlertCircle } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { typography } from '../../theme';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { StatCard } from '../../components/common/StatCard';
import { LoadingView } from '../../components/common/LoadingView';
import { EmptyState } from '../../components/common/EmptyState';
import { formatCurrency, monthName } from '../../utils/format';

export function HomeScreen({ onNavigateTab }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const res = await api.getDashboard();
      if (res?.status) {
        setDashboard(res.data);
      } else {
        setError(res?.message || 'Could not load your dashboard.');
      }
    } catch (e) {
      setError(e.message || 'Could not load your dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingView fullscreen label="Loading your dashboard…" />;

  const latestSlip = dashboard?.recent_slips?.[0];
  const recentSlips = dashboard?.recent_slips || [];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.primary} />}
    >
      {error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load dashboard" message={error} tone="error" actionLabel="Retry" onAction={() => load()} />
      ) : (
        <>
          <View style={styles.statsRow}>
            <StatCard icon={FileText} label="Payslips Issued" value={dashboard?.total_slips ?? 0} tint="cyan" />
            <StatCard
              icon={Wallet}
              label="Latest Net Pay"
              value={latestSlip ? formatCurrency(latestSlip.net_payable) : '—'}
              tint="emerald"
            />
            <StatCard
              icon={CalendarCheck}
              label="Present Days"
              value={latestSlip?.present_days ?? '—'}
              tint="violet"
            />
          </View>

          <View style={styles.quickActionsRow}>
            <QuickAction icon={FileText} label="Payslips" onPress={() => onNavigateTab?.('payslips')} theme={theme} />
            <QuickAction icon={Ticket} label="Tickets" onPress={() => onNavigateTab?.('tickets')} theme={theme} />
            <QuickAction icon={User} label="Profile" onPress={() => onNavigateTab?.('profile')} theme={theme} />
          </View>

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Recent Payslips</Text>
            <TouchableOpacity onPress={() => onNavigateTab?.('payslips')} style={styles.seeAllBtn}>
              <Text style={[styles.seeAllText, { color: theme.primary }]}>See all</Text>
              <ChevronRight size={14} color={theme.primary} />
            </TouchableOpacity>
          </View>

          {recentSlips.length === 0 ? (
            <EmptyState icon={FileText} title="No payslips yet" message="Your payslips will appear here once they're issued." />
          ) : (
            recentSlips.map((slip) => (
              <Card key={slip.id} style={styles.slipCard} elevated>
                <View style={styles.slipRow}>
                  <View style={styles.slipLeft}>
                    <Text style={[styles.slipMonth, { color: theme.textPrimary }]}>
                      {monthName(slip.month)} {slip.year}
                    </Text>
                    <Text style={[styles.slipDept, { color: theme.textMuted }]}>{slip.department || user?.department || '—'}</Text>
                  </View>
                  <View style={styles.slipRight}>
                    <Text style={[styles.slipAmount, { color: theme.emerald }]}>{formatCurrency(slip.net_payable)}</Text>
                    <Badge label="Net Pay" variant="emerald" size="small" />
                  </View>
                </View>
              </Card>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

function QuickAction({ icon: Icon, label, onPress, theme }) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.8}>
      <Card style={[styles.quickActionCard, { backgroundColor: theme.surfaceElevated }]}>
        <Icon size={20} color={theme.primary} />
        <Text style={[styles.quickActionLabel, { color: theme.textPrimary }]}>{label}</Text>
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 120,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  quickAction: {
    flex: 1,
  },
  quickActionCard: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 8,
    borderWidth: 0,
  },
  quickActionLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    ...typography.h3,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    ...typography.caption,
    fontWeight: '600',
  },
  slipCard: {
    marginBottom: 10,
    padding: 16,
  },
  slipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  slipLeft: {
    flexShrink: 1,
  },
  slipMonth: {
    ...typography.h4,
    marginBottom: 2,
  },
  slipDept: {
    ...typography.caption,
  },
  slipRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  slipAmount: {
    ...typography.h4,
  },
});
