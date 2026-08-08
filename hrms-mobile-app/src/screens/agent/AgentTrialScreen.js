import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { FileText, AlertCircle } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme';
import { Button } from '../../components/common/Button';
import { LoadingView } from '../../components/common/LoadingView';
import { EmptyState } from '../../components/common/EmptyState';
import { CandidateCard } from '../../components/agent/CandidateCard';
import { useAgentCandidates } from '../../hooks/useAgentCandidates';
import { TrialFormScreen } from './TrialFormScreen';
import { AppointmentFormScreen } from './AppointmentFormScreen';

export function AgentTrialScreen() {
  const { theme } = useTheme();
  const { candidates, loading, refreshing, error, reload } = useAgentCandidates();
  const [view, setView] = useState({ mode: 'list' });

  const trials = useMemo(() => candidates.filter((c) => c.type === 'trial'), [candidates]);

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

      <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Trial Forms</Text>

      {error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load trial forms" message={error} tone="error" actionLabel="Retry" onAction={() => reload()} />
      ) : trials.length === 0 ? (
        <EmptyState icon={FileText} title="No trial forms yet" message="Submit a new trial form to get started." />
      ) : (
        trials.map((c) => (
          <CandidateCard
            key={c.id}
            candidate={c}
            onView={(cand) => setView({ mode: 'form', initialData: { id: cand.id, raw: cand } })}
            onProcess={(cand) => setView({ mode: 'process', initialData: { id: cand.id, raw: cand } })}
          />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  newButton: { marginBottom: 20 },
  sectionTitle: { ...typography.h3, marginBottom: 12 },
});
