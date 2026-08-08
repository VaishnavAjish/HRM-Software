import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Users, ClipboardList, FileText, AlertCircle } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme';
import { StatCard } from '../../components/common/StatCard';
import { LoadingView } from '../../components/common/LoadingView';
import { EmptyState } from '../../components/common/EmptyState';
import { CandidateCard } from '../../components/agent/CandidateCard';
import { useAgentCandidates } from '../../hooks/useAgentCandidates';
import { isCandidateApproved } from './candidateHelpers';
import { AppointmentFormScreen } from './AppointmentFormScreen';
import { TrialFormScreen } from './TrialFormScreen';

// The agent's overview: totals across everything they've submitted, plus the
// full candidate list (both appointments and trial forms) for a quick glance.
// Dedicated creation/management for each record type lives on its own tab.
export function AgentDashboardScreen() {
  const { theme } = useTheme();
  const { candidates, loading, refreshing, error, reload } = useAgentCandidates();
  const [view, setView] = useState({ mode: 'list' });

  const stats = useMemo(() => {
    const pending = candidates.filter((c) => !isCandidateApproved(c)).length;
    const approved = candidates.filter((c) => isCandidateApproved(c)).length;
    return { total: candidates.length, pending, approved };
  }, [candidates]);

  const backToList = () => {
    setView({ mode: 'list' });
    reload(true);
  };

  const openView = (c) => {
    if (c.type === 'trial') {
      setView({ mode: 'trial', initialData: { id: c.id, raw: c } });
    } else {
      setView({ mode: 'appointment', initialData: { id: c.id, raw: c }, isPrefillFromTrial: false });
    }
  };

  const openProcess = (c) => {
    setView({ mode: 'appointment', initialData: { id: c.id, raw: c }, isPrefillFromTrial: true });
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

  if (loading) return <LoadingView fullscreen label="Loading your dashboard…" />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={theme.primary} />}
    >
      {error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load dashboard" message={error} tone="error" actionLabel="Retry" onAction={() => reload()} />
      ) : (
        <>
          <View style={styles.statsRow}>
            <StatCard icon={Users} label="Total Submitted" value={stats.total} tint="cyan" />
            <StatCard icon={ClipboardList} label="Pending" value={stats.pending} tint="amber" />
            <StatCard icon={FileText} label="Approved" value={stats.approved} tint="emerald" />
          </View>

          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>All Candidates</Text>

          {candidates.length === 0 ? (
            <EmptyState icon={Users} title="No candidates yet" message="Submit a new appointment or trial form to get started." />
          ) : (
            candidates.map((c) => <CandidateCard key={c.id} candidate={c} onView={openView} onProcess={openProcess} />)
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  sectionTitle: { ...typography.h3, marginBottom: 12 },
});
