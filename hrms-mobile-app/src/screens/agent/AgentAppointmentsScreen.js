import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { UserPlus, AlertCircle, Users, ClipboardList, FileText } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme';
import { Fab } from '../../components/common/Fab';
import { LoadingView } from '../../components/common/LoadingView';
import { EmptyState } from '../../components/common/EmptyState';
import { StatCard } from '../../components/common/StatCard';
import { SearchField } from '../../components/common/SearchField';
import { CandidateCard } from '../../components/agent/CandidateCard';
import { useAgentCandidates } from '../../hooks/useAgentCandidates';
import { isCandidateApproved } from './candidateHelpers';
import { AppointmentFormScreen } from './AppointmentFormScreen';

function matchesQuery(c, q) {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  return [c.name, c.email, c.mobile_number, c.emp_code, c.department, c.designation]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(needle));
}

export function AgentAppointmentsScreen() {
  const { theme } = useTheme();
  const { candidates, loading, refreshing, error, reload } = useAgentCandidates();
  const [view, setView] = useState({ mode: 'list' });
  const [query, setQuery] = useState('');

  const appointments = useMemo(() => candidates.filter((c) => c.type !== 'trial'), [candidates]);
  const filtered = useMemo(() => appointments.filter((c) => matchesQuery(c, query)), [appointments, query]);

  const stats = useMemo(() => {
    const pending = appointments.filter((c) => !isCandidateApproved(c)).length;
    const approved = appointments.filter((c) => isCandidateApproved(c)).length;
    return { total: appointments.length, pending, approved };
  }, [appointments]);

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
    <View style={styles.screen}>
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={theme.primary} />}
    >
      {error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load appointments" message={error} tone="error" actionLabel="Retry" onAction={() => reload()} />
      ) : (
        <>
          <View style={styles.statsRow}>
            <StatCard icon={Users} label="Total" value={stats.total} tint="cyan" />
            <StatCard icon={ClipboardList} label="Pending" value={stats.pending} tint="amber" />
            <StatCard icon={FileText} label="Approved" value={stats.approved} tint="emerald" />
          </View>

          <SearchField value={query} onChangeText={setQuery} placeholder="Search by name, email, mobile…" style={styles.search} />

          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Appointment Forms</Text>

          {appointments.length === 0 ? (
            <EmptyState icon={UserPlus} title="No appointments yet" message="Submit a new appointment to get started." />
          ) : filtered.length === 0 ? (
            <EmptyState icon={UserPlus} title="No matches" message="Try a different search." />
          ) : (
            filtered.map((c) => (
              <CandidateCard key={c.id} candidate={c} onView={(cand) => setView({ mode: 'form', initialData: { id: cand.id, raw: cand } })} />
            ))
          )}
        </>
      )}
    </ScrollView>

    <Fab onPress={() => setView({ mode: 'form', initialData: null })} accessibilityLabel="New appointment" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 170 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  search: { marginBottom: 16 },
  sectionTitle: { ...typography.h3, marginBottom: 12 },
});
