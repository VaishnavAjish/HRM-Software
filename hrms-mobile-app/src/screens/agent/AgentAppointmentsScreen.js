import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, FlatList, ActivityIndicator } from 'react-native';
import { UserPlus, AlertCircle, Users, ClipboardList, FileText } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography } from '../../theme';
import { api } from '../../services/api';
import { Fab } from '../../components/common/Fab';
import { LoadingView } from '../../components/common/LoadingView';
import { EmptyState } from '../../components/common/EmptyState';
import { StatCard } from '../../components/common/StatCard';
import { SearchField } from '../../components/common/SearchField';
import { SelectField } from '../../components/common/SelectField';
import { CandidateCard } from '../../components/agent/CandidateCard';
import { useAgentCandidates } from '../../hooks/useAgentCandidates';
import { isCandidateApproved } from './candidateHelpers';
import { AppointmentFormScreen } from './AppointmentFormScreen';
import { COMPANY_OPTIONS } from '../../utils/companyConfig';

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
  { value: 'rejected', label: 'Rejected' },
];
const ADMIN_COMPANY_OPTIONS = [{ value: 'all', label: 'All Companies' }, ...COMPANY_OPTIONS];
const PAGE_SIZE = 20;

// Staff-wide, server-paginated register — every agent's submissions, not just
// the caller's own. Distinct data source/shape from useAgentCandidates(),
// which is why this lives inline here rather than reusing that hook.
export function AdminAppointmentsList({ onOpen }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const canSwitchCompany = [0, 1].includes(Number(user?.role));

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  const fetchPage = useCallback(async (pageNum, { append = false, isRefresh = false } = {}) => {
    const myRequest = ++requestId.current;
    if (isRefresh) setRefreshing(true);
    else if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const params = { per_page: PAGE_SIZE, page: pageNum };
      if (search.trim()) params.search = search.trim();
      if (status) params.status = status;
      if (canSwitchCompany) params.company_code = companyFilter;
      const res = await api.getAdminAppointments(params);
      if (myRequest !== requestId.current) return;
      if (res?.status) {
        const list = res.data?.appointments || [];
        setRows((prev) => (append ? [...prev, ...list] : list));
        setPage(res.data?.meta?.current_page || pageNum);
        setLastPage(res.data?.meta?.last_page || pageNum);
        setTotal(res.data?.meta?.total || list.length);
      } else {
        setError(res?.message || 'Could not load appointments.');
      }
    } catch (e) {
      if (myRequest === requestId.current) setError(e?.message || 'Could not load appointments.');
    } finally {
      if (myRequest === requestId.current) {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    }
  }, [search, status, companyFilter, canSwitchCompany]);

  useEffect(() => {
    const t = setTimeout(() => fetchPage(1), 350);
    return () => clearTimeout(t);
  }, [search, status, companyFilter]);

  const loadMore = () => {
    if (loadingMore || loading || page >= lastPage) return;
    fetchPage(page + 1, { append: true });
  };

  return (
    <View style={styles.screen}>
      <View style={styles.adminHeaderArea}>
        <SearchField value={search} onChangeText={setSearch} placeholder="Search by name, code, mobile…" style={styles.search} />
        <View style={styles.filterRow}>
          <View style={{ flex: 1 }}>
            <SelectField value={status} onChange={setStatus} options={ADMIN_STATUS_OPTIONS} searchable={false} />
          </View>
          {canSwitchCompany ? (
            <View style={{ flex: 1 }}>
              <SelectField value={companyFilter} onChange={setCompanyFilter} options={ADMIN_COMPANY_OPTIONS} searchable={false} />
            </View>
          ) : null}
        </View>
      </View>

      {loading ? (
        <LoadingView label="Loading appointments…" />
      ) : error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load appointments" message={error} tone="error" actionLabel="Retry" onAction={() => fetchPage(1)} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.adminListContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchPage(1, { isRefresh: true })} tintColor={theme.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
          renderItem={({ item }) => <CandidateCard candidate={item} onView={onOpen} />}
          ListEmptyComponent={<EmptyState icon={UserPlus} title="No appointments found" message="Try a different search or filter." />}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color={theme.primary} /> : null}
        />
      )}
    </View>
  );
}

export function AgentAppointmentsScreen() {
  const { theme } = useTheme();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
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
    if (!isAdmin) reload(true);
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

  if (isAdmin) {
    return (
      <AdminAppointmentsList onOpen={(cand) => setView({ mode: 'form', initialData: { id: cand.id, raw: cand } })} />
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
  adminHeaderArea: { paddingHorizontal: 16, paddingTop: 16 },
  filterRow: { flexDirection: 'row', gap: 10 },
  adminListContent: { paddingHorizontal: 16, paddingBottom: 110 },
});
