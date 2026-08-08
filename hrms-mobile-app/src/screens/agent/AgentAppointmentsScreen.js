import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { UserPlus, AlertCircle } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme';
import { Button } from '../../components/common/Button';
import { LoadingView } from '../../components/common/LoadingView';
import { EmptyState } from '../../components/common/EmptyState';
import { CandidateCard } from '../../components/agent/CandidateCard';
import { useAgentCandidates } from '../../hooks/useAgentCandidates';
import { AppointmentFormScreen } from './AppointmentFormScreen';

export function AgentAppointmentsScreen() {
  const { theme } = useTheme();
  const { candidates, loading, refreshing, error, reload } = useAgentCandidates();
  const [view, setView] = useState({ mode: 'list' });

  const appointments = useMemo(() => candidates.filter((c) => c.type !== 'trial'), [candidates]);

  const backToList = () => {
    setView({ mode: 'list' });
    reload(true);
  };

  if (view.mode === 'form') {
    return (
      <AppointmentFormScreen
        initialData={view.initialData}
        isPrefillFromTrial={false}
        onDone={backToList}
        onCancel={() => setView({ mode: 'list' })}
      />
    );
  }

  if (loading) return <LoadingView fullscreen label="Loading appointments…" />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={theme.primary} />}
    >
      <Button
        title="New Appointment"
        onPress={() => setView({ mode: 'form', initialData: null })}
        icon={UserPlus}
        variant="gradient"
        style={styles.newButton}
      />

      <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Appointment Forms</Text>

      {error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load appointments" message={error} tone="error" actionLabel="Retry" onAction={() => reload()} />
      ) : appointments.length === 0 ? (
        <EmptyState icon={UserPlus} title="No appointments yet" message="Submit a new appointment to get started." />
      ) : (
        appointments.map((c) => (
          <CandidateCard key={c.id} candidate={c} onView={(cand) => setView({ mode: 'form', initialData: { id: cand.id, raw: cand } })} />
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
