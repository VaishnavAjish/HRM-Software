import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { FileText, AlertCircle, Users, ClipboardList, CheckCircle2 } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme';
import { Button } from '../../components/common/Button';
import { LoadingView } from '../../components/common/LoadingView';
import { EmptyState } from '../../components/common/EmptyState';
import { StatCard } from '../../components/common/StatCard';
import { SearchField } from '../../components/common/SearchField';
import { CandidateCard } from '../../components/agent/CandidateCard';
import { useAgentCandidates } from '../../hooks/useAgentCandidates';
import { isCandidateApproved } from './candidateHelpers';
import { TrialFormScreen } from './TrialFormScreen';
import { AppointmentFormScreen } from './AppointmentFormScreen';

function matchesQuery(c, q) {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  return [c.name, c.email, c.mobile_number, c.emp_code, c.department, c.designation]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(needle));
}

export function AgentTrialScreen() {
  const { theme } = useTheme();
  const { candidates, loading, refreshing, error, reload } = useAgentCandidates();
  const [view, setView] = useState({ mode: 'list' });
  const [query, setQuery] = useState('');

  const trials = useMemo(() => candidates.filter((c) => c.type === 'trial'), [candidates]);
  const filtered = useMemo(() => trials.filter((c) => matchesQuery(c, query)), [trials, query]);

  const stats = useMemo(() => {
    const pending = trials.filter((c) => !isCandidateApproved(c)).length;
    const approved = trials.filter((c) => isCandidateApproved(c)).length;
    return { total: trials.length, pending, approved };
  }, [trials]);

  const backToList = () => {
    setView({ mode: 'list' });
    reload(true);
  };

  if (view.mode === 'form') {
    return <TrialFormScreen initialData={view.initialData} onDone={backToList} onCancel={() => setView({ mode: 'list' })} />;
  }
  if (view.mode === 'process') {
    return (
      <AppointmentFormScreen
        initialData={view.initialData}
        isPrefillFromTrial
        onDone={backToList}
        onCancel={() => setView({ mode: 'list' })}
      />
    );
  }

  if (loading) return <LoadingView fullscreen label="Loading trial forms…" />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={theme.primary} />}
    >
      <Button
        title="New Trial Form"
        onPress={() => setView({ mode: 'form', initialData: null })}
        icon={FileText}
        variant="accent"
        style={styles.newButton}
      />

      {error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load trial forms" message={error} tone="error" actionLabel="Retry" onAction={() => reload()} />
      ) : (
        <>
          <View style={styles.statsRow}>
            <StatCard icon={Users} label="Total" value={stats.total} tint="cyan" />
            <StatCard icon={ClipboardList} label="Pending" value={stats.pending} tint="amber" />
            <StatCard icon={CheckCircle2} label="Approved" value={stats.approved} tint="emerald" />
          </View>

          <SearchField value={query} onChangeText={setQuery} placeholder="Search by name, email, mobile…" style={styles.search} />

          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Trial Forms</Text>

          {trials.length === 0 ? (
            <EmptyState icon={FileText} title="No trial forms yet" message="Submit a new trial form to get started." />
          ) : filtered.length === 0 ? (
            <EmptyState icon={FileText} title="No matches" message="Try a different search." />
          ) : (
            filtered.map((c) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                onView={(cand) => setView({ mode: 'form', initialData: { id: cand.id, raw: cand } })}
                onProcess={(cand) => setView({ mode: 'process', initialData: { id: cand.id, raw: cand } })}
              />
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
  newButton: { marginBottom: 20 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  search: { marginBottom: 16 },
  sectionTitle: { ...typography.h3, marginBottom: 12 },
});
