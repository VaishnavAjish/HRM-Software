import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Users, UserCheck, Wallet, FileText, AlertCircle, UploadCloud } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography } from '../../theme';
import { api } from '../../services/api';
import { Card } from '../../components/common/Card';
import { StatCard } from '../../components/common/StatCard';
import { Badge } from '../../components/common/Badge';
import { SelectField } from '../../components/common/SelectField';
import { LoadingView } from '../../components/common/LoadingView';
import { EmptyState } from '../../components/common/EmptyState';
import { formatCurrency, monthName, timeAgo } from '../../utils/format';
import { COMPANY_OPTIONS } from '../../utils/companyConfig';

const COMPANY_FILTER_OPTIONS = [{ value: 'all', label: 'All Companies' }, ...COMPANY_OPTIONS];

export function AdminDashboardScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  // Role 0 (Super Admin) and role 1 (company-wide Admin) can switch which
  // company's numbers they're looking at; role 2 is hard-locked server-side
  // to their own company_code+unit, so the switcher is pointless for them.
  const canSwitchCompany = [0, 1].includes(Number(user?.role));
  const [companyFilter, setCompanyFilter] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const res = await api.getAdminDashboard(canSwitchCompany ? { company_code: companyFilter } : {});
      if (res?.status) {
        setData(res.data);
      } else {
        setError(res?.message || 'Could not load the dashboard.');
      }
    } catch (e) {
      setError(e?.message || 'Could not load the dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canSwitchCompany, companyFilter]);

  useEffect(() => { load(); }, [companyFilter]);

  const departments = useMemo(() => {
    const list = data?.department_distribution || [];
    const maxCount = Math.max(1, ...list.map((d) => Number(d.total_employees) || 0));
    return [...list]
      .sort((a, b) => (Number(b.total_employees) || 0) - (Number(a.total_employees) || 0))
      .map((d) => ({ ...d, pct: Math.round(((Number(d.total_employees) || 0) / maxCount) * 100) }));
  }, [data]);

  const monthlyStats = useMemo(() => {
    const list = data?.monthly_stats || [];
    const maxNet = Math.max(1, ...list.map((m) => Number(m.total_net) || 0));
    return list.map((m) => ({ ...m, pct: Math.round(((Number(m.total_net) || 0) / maxNet) * 100) }));
  }, [data]);

  const recentBatches = data?.recent_batches || [];

  if (loading) return <LoadingView fullscreen label="Loading dashboard…" />;

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.primary} />}
    >
      <Text style={[styles.title, { color: theme.textPrimary }]}>Dashboard</Text>

      {canSwitchCompany ? (
        <SelectField
          label="Company"
          value={companyFilter}
          onChange={setCompanyFilter}
          options={COMPANY_FILTER_OPTIONS}
          searchable={false}
        />
      ) : null}

      {error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load dashboard" message={error} tone="error" actionLabel="Retry" onAction={() => load()} />
      ) : (
        <>
          <View style={styles.statsRow}>
            <StatCard icon={Users} label="Total Employees" value={data?.total_employee ?? 0} tint="cyan" />
            <StatCard icon={UserCheck} label="Active" value={data?.active_employee ?? 0} tint="emerald" />
          </View>
          <View style={styles.statsRow}>
            <StatCard icon={Wallet} label="Salary Paid" value={formatCurrency(data?.total_salary_paid)} tint="primary" />
            <StatCard icon={FileText} label="Payslips" value={data?.total_slips ?? 0} tint="amber" />
          </View>

          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Department Headcount</Text>
          {departments.length === 0 ? (
            <EmptyState icon={Users} title="No department data yet" />
          ) : (
            <Card style={styles.listCard}>
              {departments.map((d, idx) => (
                <View key={d.department} style={[styles.row, idx !== departments.length - 1 && styles.rowDivider, { borderColor: theme.border }]}>
                  <View style={styles.rowHeader}>
                    <Text style={[styles.rowLabel, { color: theme.textPrimary }]} numberOfLines={1}>{d.department}</Text>
                    <Text style={[styles.rowValue, { color: theme.textMuted }]}>{d.total_employees} · {formatCurrency(d.total_net_payable)}</Text>
                  </View>
                  <View style={[styles.barTrack, { backgroundColor: theme.surfaceElevated }]}>
                    <View style={[styles.barFill, { width: `${d.pct}%`, backgroundColor: theme.primary }]} />
                  </View>
                </View>
              ))}
            </Card>
          )}

          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Salary Trend</Text>
          {monthlyStats.length === 0 ? (
            <EmptyState icon={Wallet} title="No salary history yet" />
          ) : (
            <Card style={styles.listCard}>
              {monthlyStats.map((m, idx) => (
                <View key={`${m.year}-${m.month}`} style={[styles.row, idx !== monthlyStats.length - 1 && styles.rowDivider, { borderColor: theme.border }]}>
                  <View style={styles.rowHeader}>
                    <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>{monthName(m.month)} {m.year}</Text>
                    <Text style={[styles.rowValue, { color: theme.textMuted }]}>{formatCurrency(m.total_net)}</Text>
                  </View>
                  <View style={[styles.barTrack, { backgroundColor: theme.surfaceElevated }]}>
                    <View style={[styles.barFill, { width: `${m.pct}%`, backgroundColor: theme.emerald }]} />
                  </View>
                </View>
              ))}
            </Card>
          )}

          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Recent Uploads</Text>
          {recentBatches.length === 0 ? (
            <EmptyState icon={UploadCloud} title="No uploads yet" message="Bulk salary/employee/attendance uploads will show up here." />
          ) : (
            <Card style={styles.listCard}>
              {recentBatches.map((b, idx) => (
                <View key={b.id} style={[styles.batchRow, idx !== recentBatches.length - 1 && styles.rowDivider, { borderColor: theme.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowLabel, { color: theme.textPrimary }]} numberOfLines={1}>{b.file_name || `${b.type} upload`}</Text>
                    <Text style={[styles.batchMeta, { color: theme.textMuted }]}>{timeAgo(b.created_at)}</Text>
                  </View>
                  <Badge label={`${b.success_count ?? 0} ok`} variant="emerald" size="small" />
                  {Number(b.failed_count) > 0 ? (
                    <Badge label={`${b.failed_count} failed`} variant="rose" size="small" style={{ marginLeft: 6 }} />
                  ) : null}
                </View>
              ))}
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  title: { ...typography.h2, marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  sectionTitle: { ...typography.h3, marginTop: 18, marginBottom: 10 },
  listCard: { padding: 4 },
  row: { paddingVertical: 12, paddingHorizontal: 12 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  rowLabel: { ...typography.body, fontWeight: '600', flexShrink: 1, marginRight: 8 },
  rowValue: { ...typography.caption },
  barTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  batchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12 },
  batchMeta: { ...typography.micro, marginTop: 2 },
});
