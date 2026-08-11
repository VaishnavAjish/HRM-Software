import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Wallet, AlertCircle, ChevronLeft, ChevronRight, Download, Trash2 } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography } from '../../theme';
import { api } from '../../services/api';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { SearchField } from '../../components/common/SearchField';
import { SelectField } from '../../components/common/SelectField';
import { LoadingView } from '../../components/common/LoadingView';
import { EmptyState } from '../../components/common/EmptyState';
import { StatCard } from '../../components/common/StatCard';
import { formatCurrency, monthName } from '../../utils/format';
import { downloadPdfToDevice } from '../../utils/pdf';
import { buildPayslipHtml } from '../../utils/payslipPdf';
import { COMPANY_OPTIONS } from '../../utils/companyConfig';

const CURRENT_YEAR = new Date().getFullYear();
const MONTH_OPTIONS = [
  { value: '', label: 'Any Month' },
  ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: monthName(i + 1) })),
];
const YEAR_OPTIONS = [
  { value: '', label: 'Any Year' },
  ...Array.from({ length: 5 }, (_, i) => String(CURRENT_YEAR - i)).map((y) => ({ value: y, label: y })),
];
const COMPANY_FILTER_OPTIONS = [{ value: 'all', label: 'All Companies' }, ...COMPANY_OPTIONS];
const PAGE_SIZE = 20;

function MetaRow({ label, value, theme, valueColor }) {
  return (
    <View style={styles.metaRow}>
      <Text style={[styles.metaLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: valueColor || theme.textPrimary }]}>{value}</Text>
    </View>
  );
}

function SectionCard({ title, rows, theme, positive }) {
  return (
    <Card style={styles.metaCard} elevated>
      <Text style={[styles.metaTitle, { color: theme.textPrimary }]}>{title}</Text>
      {rows.map(([label, value]) => (
        <MetaRow key={label} label={label} value={formatCurrency(value)} theme={theme} valueColor={positive ? theme.emerald : theme.rose} />
      ))}
    </Card>
  );
}

function PayslipDetail({ id, onBack, onDeleted }) {
  const { theme } = useTheme();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getAdminPayslipDetail(id);
        if (cancelled) return;
        if (res?.status) setDetail(res.data);
        else setError(res?.message || 'Could not load this payslip.');
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Could not load this payslip.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const download = async () => {
    if (!detail) return;
    setDownloading(true);
    try {
      const html = buildPayslipHtml(detail);
      const { saved } = await downloadPdfToDevice(html, `Payslip ${detail.emp_name || detail.emp_code} - ${monthName(detail.month)} ${detail.year}`);
      if (saved) Alert.alert('Saved', 'The payslip PDF was saved to your device.');
    } catch (e) {
      Alert.alert('Could not generate PDF', e?.message || 'Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert('Delete payslip', `Remove this payslip for ${detail?.emp_name || detail?.emp_code}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            const res = await api.deleteAdminPayslip(id);
            if (res?.status !== false) {
              onDeleted();
            } else {
              Alert.alert('Could not delete', res?.message || 'Please try again.');
            }
          } catch (e) {
            Alert.alert('Could not delete', e?.message || 'Please try again.');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const earnings = detail ? [['Basic', detail.basic], ['DA', detail.da], ['HRA', detail.hra]] : [];
  const deductions = detail ? [['PF', detail.pf], ['ESI', detail.esi], ['TDS', detail.tds], ['Advance', detail.advance]] : [];

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.detailHeaderRow}>
        <TouchableOpacity onPress={onBack} style={styles.backRow} activeOpacity={0.7}>
          <ChevronLeft size={18} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary }]}>Salary</Text>
        </TouchableOpacity>
        {detail ? (
          <View style={styles.detailHeaderActions}>
            <TouchableOpacity onPress={download} disabled={downloading} style={[styles.headerActionBtn, { borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}>
              <Download size={15} color={theme.primary} />
              <Text style={[styles.headerActionText, { color: theme.primary }]}>{downloading ? 'Preparing…' : 'Download'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirmDelete} disabled={deleting} style={[styles.headerActionBtn, { borderColor: theme.rose + '40', backgroundColor: theme.roseBg }]}>
              {deleting ? <ActivityIndicator size="small" color={theme.rose} /> : <Trash2 size={15} color={theme.rose} />}
              <Text style={[styles.headerActionText, { color: theme.rose }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {loading ? (
        <LoadingView label="Loading payslip…" />
      ) : error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load payslip" message={error} tone="error" />
      ) : detail ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Card style={styles.detailHero} elevated>
            <Text style={[styles.detailName, { color: theme.textPrimary }]}>{detail.emp_name}</Text>
            <Text style={[styles.detailMonth, { color: theme.textMuted }]}>{detail.emp_code} · {monthName(detail.month)} {detail.year}</Text>
            <Text style={[styles.detailNet, { color: theme.emerald }]}>{formatCurrency(detail.net_payable)}</Text>
            <Text style={[styles.detailNetLabel, { color: theme.textMuted }]}>Net Payable</Text>
          </Card>

          <SectionCard title="Earnings" rows={earnings} theme={theme} positive />
          <SectionCard title="Deductions" rows={deductions} theme={theme} />

          <Card style={styles.metaCard} elevated>
            <Text style={[styles.metaTitle, { color: theme.textPrimary }]}>Details</Text>
            <MetaRow label="Present Days" value={detail.present_days ?? '—'} theme={theme} />
            <MetaRow label="Paid Days" value={detail.paid_day ?? '—'} theme={theme} />
            <MetaRow label="Leave" value={detail.leave ?? '—'} theme={theme} />
            <MetaRow label="Gross Salary" value={formatCurrency(detail.gross_salary)} theme={theme} />
            <MetaRow label="Department" value={detail.department || detail.user?.department || '—'} theme={theme} />
            <MetaRow label="Designation" value={detail.designation || detail.user?.designation || '—'} theme={theme} />
          </Card>

          <Card style={styles.metaCard} elevated>
            <Text style={[styles.metaTitle, { color: theme.textPrimary }]}>Bank Details</Text>
            <MetaRow label="Bank" value={detail.user?.bank_name || '—'} theme={theme} />
            <MetaRow label="Account No" value={detail.account_no || detail.user?.bank_account_no || '—'} theme={theme} />
            <MetaRow label="IFSC" value={detail.bank_ifsc || detail.user?.bank_ifsc_code || '—'} theme={theme} />
            <MetaRow label="PF No" value={detail.user?.pf_no || '—'} theme={theme} />
            <MetaRow label="ESI No" value={detail.user?.esi_no || '—'} theme={theme} />
          </Card>
        </ScrollView>
      ) : null}
    </View>
  );
}

export function AdminSalaryScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const canSwitchCompany = [0, 1].includes(Number(user?.role));

  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [slips, setSlips] = useState([]);
  const [totalNetPayable, setTotalNetPayable] = useState(0);
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
      const params = { limit: PAGE_SIZE, page: pageNum };
      if (search.trim()) params.search = search.trim();
      if (month) params.month = month;
      if (year) params.year = year;
      if (canSwitchCompany) params.company_code = companyFilter;
      const res = await api.getAdminPayslips(params);
      if (myRequest !== requestId.current) return;
      if (res?.status) {
        const list = res.data || [];
        setSlips((prev) => (append ? [...prev, ...list] : list));
        setTotalNetPayable(res.total_net_payable || 0);
        setPage(res.pagination?.current_page || pageNum);
        setLastPage(res.pagination?.last_page || pageNum);
        setTotal(res.pagination?.total || list.length);
      } else {
        setError(res?.message || 'Could not load payslips.');
      }
    } catch (e) {
      if (myRequest === requestId.current) setError(e?.message || 'Could not load payslips.');
    } finally {
      if (myRequest === requestId.current) {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    }
  }, [search, month, year, companyFilter, canSwitchCompany]);

  useEffect(() => {
    const t = setTimeout(() => fetchPage(1), 350);
    return () => clearTimeout(t);
  }, [search, month, year, companyFilter]);

  const loadMore = () => {
    if (loadingMore || loading || page >= lastPage) return;
    fetchPage(page + 1, { append: true });
  };

  if (selectedId) {
    return (
      <PayslipDetail
        id={selectedId}
        onBack={() => setSelectedId(null)}
        onDeleted={() => { setSelectedId(null); fetchPage(1); }}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.headerArea}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Salary</Text>
        <View style={styles.statsRow}>
          <StatCard icon={Wallet} label="Net Paid" value={formatCurrency(totalNetPayable)} tint="emerald" />
        </View>
        <SearchField value={search} onChangeText={setSearch} placeholder="Search by employee name or code…" />
        <View style={styles.filterRow}>
          <View style={{ flex: 1 }}>
            <SelectField value={month} onChange={setMonth} options={MONTH_OPTIONS} searchable={false} />
          </View>
          <View style={{ flex: 1 }}>
            <SelectField value={year} onChange={setYear} options={YEAR_OPTIONS} searchable={false} />
          </View>
        </View>
        {canSwitchCompany ? (
          <SelectField value={companyFilter} onChange={setCompanyFilter} options={COMPANY_FILTER_OPTIONS} searchable={false} />
        ) : null}
      </View>

      {loading ? (
        <LoadingView label="Loading payslips…" />
      ) : error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load payslips" message={error} tone="error" actionLabel="Retry" onAction={() => fetchPage(1)} />
      ) : (
        <FlatList
          data={slips}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchPage(1, { isRefresh: true })} tintColor={theme.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
          renderItem={({ item }) => (
            <TouchableOpacity activeOpacity={0.8} onPress={() => setSelectedId(item.id)}>
              <Card style={styles.slipCard} elevated>
                <View style={styles.slipRow}>
                  <View style={[styles.slipIconWrap, { backgroundColor: theme.emeraldBg }]}>
                    <Wallet size={18} color={theme.emerald} />
                  </View>
                  <View style={styles.slipMid}>
                    <Text style={[styles.slipName, { color: theme.textPrimary }]} numberOfLines={1}>{item.emp_name || item.emp_code}</Text>
                    <Text style={[styles.slipMeta, { color: theme.textMuted }]} numberOfLines={1}>
                      {item.emp_code} · {monthName(item.month)} {item.year}
                    </Text>
                  </View>
                  <View style={styles.slipRight}>
                    <Text style={[styles.slipAmount, { color: theme.emerald }]}>{formatCurrency(item.net_payable)}</Text>
                    <ChevronRight size={16} color={theme.textMuted} />
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<EmptyState icon={Wallet} title="No payslips found" message="Try a different search or filter." />}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color={theme.primary} /> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerArea: { paddingHorizontal: 16, paddingTop: 16 },
  title: { ...typography.h2, marginBottom: 12 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  filterRow: { flexDirection: 'row', gap: 10 },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  slipCard: { marginBottom: 10, padding: 14 },
  slipRow: { flexDirection: 'row', alignItems: 'center' },
  slipIconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  slipMid: { flex: 1, marginRight: 8 },
  slipName: { ...typography.h4 },
  slipMeta: { ...typography.caption, marginTop: 2 },
  slipRight: { alignItems: 'flex-end', gap: 4 },
  slipAmount: { ...typography.h4 },
  detailHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, marginBottom: 16 },
  detailHeaderActions: { flexDirection: 'row', gap: 8 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { ...typography.body, fontWeight: '600' },
  headerActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  headerActionText: { ...typography.caption, fontWeight: '700' },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  detailHero: { alignItems: 'center', paddingVertical: 24, marginBottom: 16 },
  detailName: { ...typography.h3 },
  detailMonth: { ...typography.caption, marginTop: 4, marginBottom: 8 },
  detailNet: { ...typography.h1, fontSize: 32 },
  detailNetLabel: { ...typography.caption, marginTop: 4 },
  metaCard: { marginBottom: 16, padding: 18 },
  metaTitle: { ...typography.h4, marginBottom: 12 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  metaLabel: { ...typography.body },
  metaValue: { ...typography.body, fontWeight: '600' },
});
