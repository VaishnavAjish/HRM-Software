import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Users, FileText, ClipboardList, AlertCircle, Mail, Phone, UserPlus, ArrowRightCircle } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { typography } from '../../theme';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { StatCard } from '../../components/common/StatCard';
import { LoadingView } from '../../components/common/LoadingView';
import { EmptyState } from '../../components/common/EmptyState';
import { Avatar } from '../../components/common/Avatar';
import { timeAgo } from '../../utils/format';
import { AppointmentFormScreen } from './AppointmentFormScreen';
import { TrialFormScreen } from './TrialFormScreen';

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

function isCandidateApproved(c) {
  return Boolean(c.emp_code) || Number(c.checkbox) === 1 || String(c.status) === '1' || c.status === 'Approved';
}

function isCandidateProcessed(c) {
  return Number(c.processed) === 1;
}

function canProcess(c) {
  return c.type === 'trial' && isCandidateApproved(c) && !isCandidateProcessed(c);
}

export function AgentDashboardScreen() {
  const { theme } = useTheme();
  const [view, setView] = useState({ mode: 'list' });
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
    const pending = candidates.filter((c) => !isCandidateApproved(c)).length;
    const approved = candidates.filter((c) => isCandidateApproved(c)).length;
    return { total: candidates.length, pending, approved };
  }, [candidates]);

  const backToList = () => {
    setView({ mode: 'list' });
    load(true);
  };

  if (view.mode === 'appointment') {
    return (
      <AppointmentFormScreen
        initialData={view.initialData}
        isPrefillFromTrial={view.isPrefillFromTrial}
        onDone={backToList}
        onCancel={() => setView({ mode: 'list' })}
      />
    );
  }
  if (view.mode === 'trial') {
    return <TrialFormScreen initialData={view.initialData} onDone={backToList} onCancel={() => setView({ mode: 'list' })} />;
  }

  if (loading) return <LoadingView fullscreen label="Loading your candidates…" />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.primary} />}
    >
      <View style={styles.newButtonsRow}>
        <Button
          title="New Appointment"
          onPress={() => setView({ mode: 'appointment', initialData: null, isPrefillFromTrial: false })}
          icon={UserPlus}
          variant="gradient"
          size="small"
          style={styles.newButton}
        />
        <Button
          title="New Trial Form"
          onPress={() => setView({ mode: 'trial', initialData: null })}
          icon={FileText}
          variant="accent"
          size="small"
          style={styles.newButton}
        />
      </View>

      {error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load candidates" message={error} tone="error" actionLabel="Retry" onAction={() => load()} />
      ) : (
        <>
          <View style={styles.statsRow}>
            <StatCard icon={Users} label="Total Submitted" value={stats.total} tint="cyan" />
            <StatCard icon={ClipboardList} label="Pending" value={stats.pending} tint="amber" />
            <StatCard icon={FileText} label="Approved" value={stats.approved} tint="emerald" />
          </View>

          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Your Candidates</Text>

          {candidates.length === 0 ? (
            <EmptyState icon={Users} title="No candidates yet" message="Submit a new appointment or trial form to get started." />
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
                  <View style={styles.badgeCol}>
                    <Badge label={typeLabel(c.type)} variant={TYPE_VARIANT[c.type] || 'default'} size="small" />
                    <Badge
                      label={isCandidateApproved(c) ? 'Approved' : 'Pending'}
                      variant={isCandidateApproved(c) ? 'emerald' : 'amber'}
                      size="small"
                      style={{ marginTop: 4 }}
                    />
                  </View>
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

                <View style={styles.candidateBottomRow}>
                  <Text style={[styles.candidateTime, { color: theme.textMuted }]}>Submitted {timeAgo(c.created_at)}</Text>
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      onPress={() =>
                        c.type === 'trial'
                          ? setView({ mode: 'trial', initialData: { id: c.id, raw: c } })
                          : setView({ mode: 'appointment', initialData: { id: c.id, raw: c }, isPrefillFromTrial: false })
                      }
                    >
                      <Text style={[styles.actionLink, { color: theme.primary }]}>View</Text>
                    </TouchableOpacity>
                    {canProcess(c) ? (
                      <TouchableOpacity
                        style={styles.processBtn}
                        onPress={() => setView({ mode: 'appointment', initialData: { id: c.id, raw: c }, isPrefillFromTrial: true })}
                      >
                        <ArrowRightCircle size={13} color={theme.emerald} />
                        <Text style={[styles.actionLink, { color: theme.emerald }]}>Process</Text>
                      </TouchableOpacity>
                    ) : c.type === 'trial' && isCandidateProcessed(c) ? (
                      <Text style={[styles.processedLabel, { color: theme.textMuted }]}>Processed</Text>
                    ) : null}
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  newButtonsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  newButton: { flex: 1 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  sectionTitle: { ...typography.h3, marginBottom: 12 },
  candidateCard: { marginBottom: 10, padding: 16 },
  candidateTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  candidateInfo: { flex: 1, marginLeft: 12, marginRight: 8 },
  candidateName: { ...typography.h4 },
  candidateMeta: { ...typography.caption, marginTop: 2 },
  badgeCol: { alignItems: 'flex-end' },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 10 },
  contactItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  contactText: { ...typography.caption },
  candidateBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148,163,184,0.25)',
  },
  candidateTime: { ...typography.micro },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  actionLink: { ...typography.caption, fontWeight: '700' },
  processBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  processedLabel: { ...typography.caption, fontWeight: '600' },
});
