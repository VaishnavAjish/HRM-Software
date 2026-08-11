import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { FileText, AlertCircle, Users, ClipboardList, CheckCircle2, Trash2, XCircle } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography } from '../../theme';
import { api } from '../../services/api';
import { Card } from '../../components/common/Card';
import { Avatar } from '../../components/common/Avatar';
import { Badge } from '../../components/common/Badge';
import { Fab } from '../../components/common/Fab';
import { LoadingView } from '../../components/common/LoadingView';
import { EmptyState } from '../../components/common/EmptyState';
import { StatCard } from '../../components/common/StatCard';
import { SearchField } from '../../components/common/SearchField';
import { SelectField } from '../../components/common/SelectField';
import { CandidateCard } from '../../components/agent/CandidateCard';
import { useAgentCandidates } from '../../hooks/useAgentCandidates';
import { isCandidateApproved } from './candidateHelpers';
import { TrialFormScreen } from './TrialFormScreen';
import { AppointmentFormScreen } from './AppointmentFormScreen';
import { COMPANY_OPTIONS } from '../../utils/companyConfig';
import { timeAgo } from '../../utils/format';

function matchesQuery(c, q) {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  return [c.name, c.email, c.mobile_number, c.emp_code, c.department, c.designation]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(needle));
}

const ADMIN_STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
];
const ADMIN_COMPANY_OPTIONS = [{ value: 'all', label: 'All Companies' }, ...COMPANY_OPTIONS];

function AdminTrialRow({ trial, onView, onToggleApproval, onDelete, busy }) {
  const { theme } = useTheme();
  const approved = isCandidateApproved(trial);
  return (
    <Card style={styles.adminRow} elevated>
      <TouchableOpacity activeOpacity={0.8} onPress={() => onView(trial)}>
        <View style={styles.adminRowTop}>
          <Avatar name={trial.name} uri={trial.photo} size={44} />
          <View style={styles.adminRowInfo}>
            <Text style={[styles.adminRowName, { color: theme.textPrimary }]} numberOfLines={1}>{trial.name || 'Unnamed candidate'}</Text>
            <Text style={[styles.adminRowMeta, { color: theme.textMuted }]} numberOfLines={1}>
              {trial.designation || trial.department || '—'}{trial.mobile_number ? ` · ${trial.mobile_number}` : ''}
            </Text>
            <Text style={[styles.adminRowMeta, { color: theme.textMuted }]} numberOfLines={1}>
              {[trial.company_code, trial.unit].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Badge label={approved ? 'Approved' : 'Pending'} variant={approved ? 'emerald' : 'amber'} size="small" />
        </View>
      </TouchableOpacity>

      <View style={styles.adminRowBottom}>
        <Text style={[styles.adminRowTime, { color: theme.textMuted }]}>Submitted {timeAgo(trial.created_at)}</Text>
        <View style={styles.adminRowActions}>
          {busy ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <>
              <TouchableOpacity onPress={() => onToggleApproval(trial, !approved)} style={styles.adminActionBtn}>
                {approved ? <XCircle size={14} color={theme.amber} /> : <CheckCircle2 size={14} color={theme.emerald} />}
                <Text style={[styles.adminActionText, { color: approved ? theme.amber : theme.emerald }]}>
                  {approved ? 'Unapprove' : 'Approve'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onDelete(trial)} style={styles.adminActionBtn}>
                <Trash2 size={14} color={theme.rose} />
                <Text style={[styles.adminActionText, { color: theme.rose }]}>Delete</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Card>
  );
}

// Staff-wide register (every agent's trial-form submissions, not just the
// caller's own). Unlike Appointments, this backend endpoint never got
// pagination, so it's fetched whole and filtered client-side like the
// original agent view — just with a wider scope and admin-only actions.
export function AdminTrialList({ onOpen }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const canSwitchCompany = [0, 1].includes(Number(user?.role));

  const [trials, setTrials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const params = {};
      if (canSwitchCompany) params.company_code = companyFilter;
      const res = await api.getAdminTrialForms(params);
      if (res?.status) setTrials(res.data || []);
      else setError(res?.message || 'Could not load trial forms.');
    } catch (e) {
      setError(e?.message || 'Could not load trial forms.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canSwitchCompany, companyFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return trials
      .filter((c) => matchesQuery(c, search))
      .filter((c) => {
        if (!status) return true;
        const approved = isCandidateApproved(c);
        return status === 'approved' ? approved : !approved;
      });
  }, [trials, search, status]);

  const toggleApproval = async (trial, approve) => {
    setBusyId(trial.id);
    try {
      const res = await api.setTrialFormApproval(trial.id, approve);
      if (res?.status) {
        setTrials((prev) => prev.map((t) => (t.id === trial.id ? { ...t, checkbox: approve ? 1 : 0 } : t)));
      } else {
        Alert.alert('Could not update', res?.message || 'Please try again.');
      }
    } catch (e) {
      Alert.alert('Could not update', e?.message || 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = (trial) => {
    Alert.alert('Delete trial form', `Remove ${trial.name || 'this candidate'}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusyId(trial.id);
          try {
            const res = await api.deleteTrialForm(trial.id);
            if (res?.status !== false) {
              setTrials((prev) => prev.filter((t) => t.id !== trial.id));
            } else {
              Alert.alert('Could not delete', res?.message || 'Please try again.');
            }
          } catch (e) {
            Alert.alert('Could not delete', e?.message || 'Please try again.');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  if (loading) return <LoadingView fullscreen label="Loading trial forms…" />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.primary} />}
    >
      {error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load trial forms" message={error} tone="error" actionLabel="Retry" onAction={() => load()} />
      ) : (
        <>
          <SearchField value={search} onChangeText={setSearch} placeholder="Search candidate name, code, mobile…" style={{ marginBottom: 10 }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingBottom: 10 }}>
            {[
              { value: '', label: 'All Statuses' },
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
            ].map((pill) => {
              const isActive = status === pill.value;
              return (
                <TouchableOpacity
                  key={pill.value}
                  onPress={() => setStatus(pill.value)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                    borderRadius: 20,
                    borderWidth: 1,
                    backgroundColor: isActive ? theme.primary : theme.surfaceElevated,
                    borderColor: isActive ? theme.primary : theme.border,
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: isActive ? '#FFFFFF' : theme.textMuted }}>{pill.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {trials.length === 0 ? (
            <EmptyState icon={FileText} title="No trial forms yet" />
          ) : filtered.length === 0 ? (
            <EmptyState icon={FileText} title="No matches" message="Try a different search or filter." />
          ) : (
            filtered.map((c) => (
              <AdminTrialRow
                key={c.id}
                trial={c}
                onView={onOpen}
                onToggleApproval={toggleApproval}
                onDelete={confirmDelete}
                busy={busyId === c.id}
              />
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

export function AgentTrialScreen() {
  const { theme } = useTheme();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
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
    if (!isAdmin) reload(true);
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

  if (isAdmin) {
    return <AdminTrialList onOpen={(cand) => setView({ mode: 'form', initialData: { id: cand.id, raw: cand } })} />;
  }

  if (loading) return <LoadingView fullscreen label="Loading trial forms…" />;

  return (
    <View style={styles.screen}>
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={theme.primary} />}
    >
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

    <Fab onPress={() => setView({ mode: 'form', initialData: null })} accessibilityLabel="New trial form" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 170 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  search: { marginBottom: 16 },
  sectionTitle: { ...typography.h3, marginBottom: 12 },
  filterRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  adminRow: { marginBottom: 10, padding: 16 },
  adminRowTop: { flexDirection: 'row', alignItems: 'center' },
  adminRowInfo: { flex: 1, marginLeft: 12, marginRight: 8 },
  adminRowName: { ...typography.h4 },
  adminRowMeta: { ...typography.caption, marginTop: 2 },
  adminRowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148,163,184,0.25)',
  },
  adminRowTime: { ...typography.micro },
  adminRowActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  adminActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  adminActionText: { ...typography.caption, fontWeight: '700' },
});
