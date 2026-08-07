import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Clock, MapPin, Ticket, Calendar, FileText, Megaphone, ArrowUpRight, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { typography, shadows } from '../../theme';
import { api } from '../../services/api';

export function HomeScreen({ onNavigateTab }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [attendance, setAttendance] = useState(null);
  const [leaves, setLeaves] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loadingPunch, setLoadingPunch] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    const att = await api.getAttendance();
    const lev = await api.getLeaves();
    const tck = await api.getTickets();
    setAttendance(att);
    setLeaves(lev);
    setTickets(tck);
  };

  const handleTogglePunch = async () => {
    setLoadingPunch(true);
    if (attendance?.isPunchedIn) {
      await api.punchOut();
    } else {
      await api.punchIn();
    }
    const updated = await api.getAttendance();
    setAttendance({ ...updated });
    setLoadingPunch(false);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>

      {/* Quick Punch In/Out Card */}
      <Card style={styles.punchCard} glass>
        <View style={styles.punchHeaderRow}>
          <View style={styles.punchBadgeGroup}>
            <View style={[styles.statusPulse, { backgroundColor: attendance?.isPunchedIn ? theme.emerald : theme.amber }]} />
            <Text style={[styles.punchStatusText, { color: attendance?.isPunchedIn ? theme.emerald : theme.amber }]}>
              {attendance?.isPunchedIn ? 'On Shift (Punched In)' : 'Off Shift (Punched Out)'}
            </Text>
          </View>
          <Text style={[styles.shiftTimer, { color: theme.textPrimary }]}>
            {attendance?.isPunchedIn ? attendance?.totalHoursToday : '--:--'}
          </Text>
        </View>

        {/* Location & Shift detail */}
        <View style={styles.locationRow}>
          <MapPin size={15} color={theme.primary} />
          <Text style={[styles.locationText, { color: theme.textMuted }]}>
            {attendance?.location || 'HQ Alpha - Verified GPS'}
          </Text>
        </View>

        <View style={styles.punchActionRow}>
          <Button
            title={attendance?.isPunchedIn ? 'Clock Out' : 'Clock In Now'}
            variant={attendance?.isPunchedIn ? 'rose' : 'emerald'}
            onPress={handleTogglePunch}
            loading={loadingPunch}
            icon={Clock}
            style={{ flex: 1 }}
          />
          <TouchableOpacity
            style={[styles.historyIconBtn, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
            onPress={() => onNavigateTab('attendance')}
          >
            <ArrowUpRight size={20} color={theme.textPrimary} />
          </TouchableOpacity>
        </View>
      </Card>

      {/* Stats Summary Widgets Grid */}
      <View style={styles.statsGrid}>
        {/* Attendance Punctuality */}
        <TouchableOpacity
          style={[styles.statBox, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}
          onPress={() => onNavigateTab('attendance')}
          activeOpacity={0.8}
        >
          <View style={[styles.statIconBadge, { backgroundColor: theme.emeraldBg }]}>
            <Clock size={18} color={theme.emerald} />
          </View>
          <Text style={[styles.statNumber, { color: theme.textPrimary }]}>
            {attendance?.monthlySummary?.punctualityRate || '95.6%'}
          </Text>
          <Text style={[styles.statLabel, { color: theme.textMuted }]}>Punctuality</Text>
        </TouchableOpacity>

        {/* Casual Leave Available */}
        <TouchableOpacity
          style={[styles.statBox, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}
          onPress={() => onNavigateTab('leave')}
          activeOpacity={0.8}
        >
          <View style={[styles.statIconBadge, { backgroundColor: theme.cyanBg }]}>
            <Calendar size={18} color={theme.cyan} />
          </View>
          <Text style={[styles.statNumber, { color: theme.textPrimary }]}>
            {leaves?.quotas?.[0]?.remaining ?? 6} Days
          </Text>
          <Text style={[styles.statLabel, { color: theme.textMuted }]}>Casual Leave</Text>
        </TouchableOpacity>

        {/* Open Tickets */}
        <TouchableOpacity
          style={[styles.statBox, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}
          onPress={() => onNavigateTab('tickets')}
          activeOpacity={0.8}
        >
          <View style={[styles.statIconBadge, { backgroundColor: theme.violetBg }]}>
            <Ticket size={18} color={theme.violet} />
          </View>
          <Text style={[styles.statNumber, { color: theme.textPrimary }]}>
            {tickets?.length || 2} Open
          </Text>
          <Text style={[styles.statLabel, { color: theme.textMuted }]}>Helpdesk</Text>
        </TouchableOpacity>
      </View>

      {/* Quick Action Shortcuts Bar */}
      <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Quick Actions</Text>
      <View style={styles.shortcutRow}>
        <TouchableOpacity style={[styles.shortcutCard, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]} onPress={() => onNavigateTab('tickets')}>
          <Ticket size={22} color={theme.primary} />
          <Text style={[styles.shortcutText, { color: theme.textPrimary }]}>Raise Ticket</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.shortcutCard, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]} onPress={() => onNavigateTab('leave')}>
          <Calendar size={22} color={theme.emerald} />
          <Text style={[styles.shortcutText, { color: theme.textPrimary }]}>Apply Leave</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.shortcutCard, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]} onPress={() => onNavigateTab('payslips')}>
          <FileText size={22} color={theme.cyan} />
          <Text style={[styles.shortcutText, { color: theme.textPrimary }]}>Payslip</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Announcement */}
      <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginTop: 22 }]}>Enterprise Announcements</Text>
      <Card style={styles.announcementCard} glass>
        <View style={styles.announcementHeader}>
          <View style={[styles.announcementIconCircle, { backgroundColor: theme.violetBg }]}>
            <Megaphone size={18} color={theme.violet} />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.announcementTitle, { color: theme.textPrimary }]}>Q3 All-Hands Townhall Meeting</Text>
            <Text style={[styles.announcementTime, { color: theme.textMuted }]}>Posted yesterday by HR Communications</Text>
          </View>
        </View>
        <Text style={[styles.announcementBody, { color: theme.textSecondary }]}>
          Join our leadership team this Thursday at 04:00 PM EST for the quarterly update on company growth, team promotions, and project roadmaps.
        </Text>
      </Card>

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
  punchCard: {
    marginBottom: 20,
  },
  punchHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  punchBadgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  punchStatusText: {
    ...typography.caption,
    fontWeight: '700',
  },
  shiftTimer: {
    ...typography.h2,
    fontWeight: '800',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  locationText: {
    ...typography.caption,
  },
  punchActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  historyIconBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 22,
  },
  statBox: {
    flex: 1,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  statIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statNumber: {
    ...typography.h3,
    fontWeight: '700',
  },
  statLabel: {
    ...typography.micro,
    marginTop: 2,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: 12,
  },
  shortcutRow: {
    flexDirection: 'row',
    gap: 10,
  },
  shortcutCard: {
    flex: 1,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  shortcutText: {
    ...typography.caption,
    fontWeight: '600',
  },
  announcementCard: {
    padding: 16,
  },
  announcementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  announcementIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  announcementTitle: {
    ...typography.h4,
  },
  announcementTime: {
    ...typography.micro,
  },
  announcementBody: {
    ...typography.body,
    fontSize: 13,
    lineHeight: 19,
  },
});
