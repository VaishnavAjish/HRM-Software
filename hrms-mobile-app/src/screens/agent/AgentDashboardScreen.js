import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Users, FileText, ClipboardList, AlertCircle, Mail, Phone } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { api } from '../../services/api';
import { typography } from '../../theme';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { StatCard } from '../../components/common/StatCard';
import { LoadingView } from '../../components/common/LoadingView';
import { EmptyState } from '../../components/common/EmptyState';
import { Avatar } from '../../components/common/Avatar';
import { timeAgo } from '../../utils/format';

const TYPE_VARIANT = {
  appointment: 'emerald',
  trial: 'amber',
  pending_employee: 'violet',
};

function typeLabel(type) {
  if (type === 'appointment') return 'Appointment';
  if (type === 'trial') return 'Trial Form';
  if (type === 'pending_employee') return 'Pending';
  return 'Candidate';
}

export function AgentDashboardScreen() {
  const { theme } = useTheme();
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const res = await api.getAgentCandidates();
      if (res?.status) {
        setCandidates(res.data || []);
      } else {
        setError(res?.message || 'Could not load your candidates.');
      }
    } catch (e) {
      setError(e.message || 'Could not load your candidates.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const appointments = candidates.filter((c) => c.type === 'appointment').length;
    const trials = candidates.filter((c) => c.type === 'trial').length;
    return { total: candidates.length, appointments, trials };
  }, [candidates]);

  if (loading) return <LoadingView fullscreen label="Loading your candidates…" />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.primary} />}
    >
      {error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load candidates" message={error} tone="error" actionLabel="Retry" onAction={() => load()} />
      ) : (
        <>
          <View style={styles.statsRow}>
            <StatCard icon={Users} label="Total Submitted" value={stats.total} tint="cyan" />
            <StatCard icon={FileText} label="Appointments" value={stats.appointments} tint="emerald" />
            <StatCard icon={ClipboardList} label="Trial Forms" value={stats.trials} tint="amber" />
          </View>

          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Your Candidates</Text>

          {candidates.length === 0 ? (
            <EmptyState icon={Users} title="No candidates yet" message="Candidates you submit will show up here." />
          ) : (
            candidates.map((c) => (
              <Card key={c.id} style={styles.candidateCard} elevated>
                <View style={styles.candidateTop}>
                  <Avatar name={c.name} uri={c.photo} size={44} />
                  <View style={styles.candidateInfo}>
                    <Text style={[styles.candidateName, { color: theme.textPrimary }]} numberOfLines={1}>
                      {c.name || 'Unnamed candidate'}
                    </Text>
                    <Text style={[styles.candidateMeta, { color: theme.textMuted }]} numberOfLines={1}>
                      {c.designation || c.department || '—'}
                    </Text>
                  </View>
                  <Badge label={typeLabel(c.type)} variant={TYPE_VARIANT[c.type] || 'default'} size="small" />
                </View>

                <View style={styles.contactRow}>
                  {c.email ? (
                    <View style={styles.contactItem}>
                      <Mail size={12} color={theme.textMuted} />
                      <Text style={[styles.contactText, { color: theme.textMuted }]} numberOfLines={1}>{c.email}</Text>
                    </View>
                  ) : null}
                  {c.mobile_number ? (
                    <View style={styles.contactItem}>
                      <Phone size={12} color={theme.textMuted} />
                      <Text style={[styles.contactText, { color: theme.textMuted }]}>{c.mobile_number}</Text>
                    </View>
                  ) : null}
                </View>

                <Text style={[styles.candidateTime, { color: theme.textMuted }]}>
                  Submitted {timeAgo(c.created_at)}
                </Text>
              </Card>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 120 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  sectionTitle: { ...typography.h3, marginBottom: 12 },
  candidateCard: { marginBottom: 10, padding: 16 },
  candidateTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  candidateInfo: { flex: 1, marginLeft: 12, marginRight: 8 },
  candidateName: { ...typography.h4 },
  candidateMeta: { ...typography.caption, marginTop: 2 },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 6 },
  contactItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  contactText: { ...typography.caption },
  candidateTime: { ...typography.micro },
});
