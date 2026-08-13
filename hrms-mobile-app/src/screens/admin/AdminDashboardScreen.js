import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Users, UserCheck, Wallet, FileText, AlertCircle, ChevronDown, ChevronUp, Activity, CheckCircle2 } from 'lucide-react-native';
import Svg, { G, Circle } from 'react-native-svg';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography, shadows } from '../../theme';
import { api } from '../../services/api';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { LoadingView } from '../../components/common/LoadingView';
import { EmptyState } from '../../components/common/EmptyState';
import { formatCurrency, monthName } from '../../utils/format';

const DONUT_COLORS = [
  '#2563EB', // Blue
  '#059669', // Emerald
  '#7C3AED', // Violet
  '#3B82F6', // Light Blue
  '#10B981', // Mint Green
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#6366F1', // Indigo
];

function DonutChart({ data, size = 126, strokeWidth = 20 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = useMemo(() => data.reduce((acc, item) => acc + (Number(item.value) || 0), 0), [data]);

  if (total === 0) {
    return (
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#E2E8F0" strokeWidth={strokeWidth} fill="transparent" />
      </Svg>
    );
  }

  let accumulatedPercent = 0;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
        {data.map((item, index) => {
          const val = Number(item.value) || 0;
          const percent = val / total;
          const strokeDasharray = `${Math.max(1, percent * circumference - 2)} ${circumference}`;
          const strokeDashoffset = -accumulatedPercent * circumference;
          accumulatedPercent += percent;

          return (
            <Circle
              key={item.label || index}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={item.color}
              strokeWidth={strokeWidth}
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              fill="transparent"
            />
          );
        })}
      </G>
    </Svg>
  );
}

function MetricBox({ icon: Icon, label, value, badgeLabel, badgeVariant, tintColor }) {
  const { theme } = useTheme();
  return (
    <Card style={styles.kpiCard} elevated>
      <View style={styles.kpiHeader}>
        <View style={[styles.iconWrap, { backgroundColor: tintColor + '15' }]}>
          <Icon size={18} color={tintColor} />
        </View>
        {badgeLabel ? <Badge label={badgeLabel} variant={badgeVariant || 'emerald'} size="small" /> : null}
      </View>
      <Text style={[styles.kpiVal, { color: theme.textPrimary }]}>{value}</Text>
      <Text style={[styles.kpiLbl, { color: theme.textMuted }]}>{label}</Text>
    </Card>
  );
}

export function AdminDashboardScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [expandedDept, setExpandedDept] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
      try {
        const cached = await AsyncStorage.getItem('admin_dashboard_cache');
        if (cached) {
          setData(JSON.parse(cached));
          setLoading(false);
        }
      } catch (e) {}
    }
    setError(null);
    try {
      const res = await api.getAdminDashboard({});
      if (res?.status) {
        setData(res.data);
        AsyncStorage.setItem('admin_dashboard_cache', JSON.stringify(res.data)).catch(() => {});
      } else {
        setError(res?.message || 'Could not load the dashboard.');
      }
    } catch (e) {
      setError(e?.message || 'Could not load the dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const departments = useMemo(() => {
    const list = data?.department_distribution || [];
    return [...list]
      .sort((a, b) => (Number(b.total_employees) || 0) - (Number(a.total_employees) || 0))
      .map((d, idx) => ({
        ...d,
        color: DONUT_COLORS[idx % DONUT_COLORS.length],
        value: Number(d.total_employees) || 0,
      }));
  }, [data]);

  const monthlyStats = useMemo(() => {
    const list = data?.monthly_stats || [];
    const maxNet = Math.max(1, ...list.map((m) => Number(m.total_net) || 0));
    return list.map((m) => ({ ...m, pct: Math.round(((Number(m.total_net) || 0) / maxNet) * 100) }));
  }, [data]);

  if (loading) return <LoadingView fullscreen label="Loading executive dashboard…" />;

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.primary} />}
    >
      {error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load dashboard" message={error} tone="error" actionLabel="Retry" onAction={() => load()} />
      ) : (
        <>
          {/* Executive Metrics 2x2 Grid */}
          <View style={styles.kpiGrid}>
            <View style={styles.kpiCol}>
              <MetricBox
                icon={Users}
                label="Total Workforce"
                value={data?.total_employee ?? 0}
                badgeLabel="Enrolled"
                badgeVariant="default"
                tintColor={theme.primary}
              />
            </View>
            <View style={styles.kpiCol}>
              <MetricBox
                icon={UserCheck}
                label="Active Staff"
                value={data?.active_employee ?? 0}
                badgeLabel="Active"
                badgeVariant="emerald"
                tintColor={theme.emerald}
              />
            </View>
          </View>

          <View style={styles.kpiGrid}>
            <View style={styles.kpiCol}>
              <MetricBox
                icon={Wallet}
                label="Total Salary Paid"
                value={formatCurrency(data?.total_salary_paid)}
                badgeLabel="Disbursed"
                badgeVariant="violet"
                tintColor={theme.violet}
              />
            </View>
            <View style={styles.kpiCol}>
              <MetricBox
                icon={FileText}
                label="Payslips Issued"
                value={data?.total_slips ?? 0}
                badgeLabel="Records"
                badgeVariant="amber"
                tintColor={theme.amber}
              />
            </View>
          </View>

          {/* Department Distribution Section with Donut Chart */}
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Department Distribution</Text>
            <Badge label="Compare" variant="default" />
          </View>

          {departments.length === 0 ? (
            <EmptyState icon={Users} title="No department data available" />
          ) : (
            <Card style={styles.deptCard} elevated>
              <View style={styles.deptCardBody}>
                {/* Left Side Donut Chart */}
                <View style={styles.donutWrap}>
                  <DonutChart data={departments} size={124} strokeWidth={18} />
                </View>

                {/* Right Side Department Items */}
                <View style={styles.deptListWrap}>
                  {departments.map((d) => {
                    const isExpanded = expandedDept === d.department;
                    const avgSalary = d.value > 0 ? Math.round(Number(d.total_net_payable) / d.value) : 0;
                    return (
                      <View key={d.department} style={styles.deptItem}>
                        <TouchableOpacity
                          style={styles.deptItemHeader}
                          activeOpacity={0.7}
                          onPress={() => setExpandedDept(isExpanded ? null : d.department)}
                        >
                          <View style={styles.deptItemTitleRow}>
                            <View style={[styles.colorDot, { backgroundColor: d.color }]} />
                            <Text style={[styles.deptName, { color: theme.textPrimary }]} numberOfLines={1}>
                              {d.department}
                            </Text>
                          </View>

                          <View style={styles.deptItemMetaRow}>
                            <Text style={[styles.deptMetaText, { color: theme.textMuted }]}>
                              <Text style={{ fontWeight: '700', color: theme.primary }}>{d.value}</Text> Staff · {formatCurrency(d.total_net_payable)}
                            </Text>
                            <View style={styles.detailsToggle}>
                              <Text style={[styles.detailsText, { color: theme.textMuted }]}>Details</Text>
                              {isExpanded ? <ChevronUp size={14} color={theme.textMuted} /> : <ChevronDown size={14} color={theme.textMuted} />}
                            </View>
                          </View>
                        </TouchableOpacity>

                        {isExpanded ? (
                          <View style={[styles.deptExpandedBox, { backgroundColor: theme.surfaceElevated }]}>
                            <View style={styles.deptExpRow}>
                              <Text style={[styles.deptExpLabel, { color: theme.textMuted }]}>Avg Salary / Staff:</Text>
                              <Text style={[styles.deptExpVal, { color: theme.textPrimary }]}>{formatCurrency(avgSalary)}</Text>
                            </View>
                            <View style={styles.deptExpRow}>
                              <Text style={[styles.deptExpLabel, { color: theme.textMuted }]}>Workforce Share:</Text>
                              <Text style={[styles.deptExpVal, { color: theme.textPrimary }]}>
                                {Math.round((d.value / Math.max(1, data?.total_employee || 1)) * 100)}%
                              </Text>
                            </View>
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            </Card>
          )}

          {/* Team Activity Section */}
          <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginTop: 18 }]}>Team Activity</Text>
          <Card style={styles.activityCard} elevated>
            <View style={styles.activityRow}>
              <View style={[styles.activityIconBox, { backgroundColor: theme.emerald + '15' }]}>
                <CheckCircle2 size={18} color={theme.emerald} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.activityTitle, { color: theme.textPrimary }]}>HR System Status</Text>
                <Text style={[styles.activitySub, { color: theme.textMuted }]}>All services operating normally</Text>
              </View>
              <Badge label="Healthy" variant="emerald" size="small" />
            </View>

            <View style={[styles.activityRow, { borderBottomWidth: 0, paddingTop: 10 }]}>
              <View style={[styles.activityIconBox, { backgroundColor: theme.primary + '15' }]}>
                <Activity size={18} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.activityTitle, { color: theme.textPrimary }]}>Active Workforce</Text>
                <Text style={[styles.activitySub, { color: theme.textMuted }]}>
                  {data?.active_employee ?? 0} active out of {data?.total_employee ?? 0} total employees
                </Text>
              </View>
            </View>
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingTop: 12, paddingBottom: 110 },
  kpiGrid: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  kpiCol: { flex: 1 },
  kpiCard: { padding: 12 },
  kpiHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  iconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  kpiVal: { ...typography.h3, fontWeight: '800', marginBottom: 2 },
  kpiLbl: { ...typography.micro, fontWeight: '600' },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 10 },
  sectionTitle: { ...typography.h4 },
  deptCard: { padding: 14 },
  deptCardBody: { flexDirection: 'column' },
  donutWrap: { alignItems: 'center', justifyContent: 'center', marginVertical: 10 },
  deptListWrap: { marginTop: 10 },
  deptItem: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  deptItemHeader: {},
  deptItemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  deptName: { ...typography.body, fontWeight: '700', flex: 1 },
  deptItemMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 18 },
  deptMetaText: { ...typography.caption },
  detailsToggle: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  detailsText: { ...typography.micro, fontWeight: '600' },
  deptExpandedBox: { marginTop: 8, marginLeft: 18, padding: 10, borderRadius: 10 },
  deptExpRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  deptExpLabel: { ...typography.micro },
  deptExpVal: { ...typography.micro, fontWeight: '700' },
  activityCard: { padding: 12 },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  activityIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  activityTitle: { ...typography.body, fontWeight: '700' },
  activitySub: { ...typography.caption, marginTop: 1 },
});
