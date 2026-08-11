import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, ScrollView, RefreshControl, TouchableOpacity,
  ActivityIndicator, Alert, Modal
} from 'react-native';
import {
  Wallet, AlertCircle, ChevronLeft, ChevronRight, Download, Trash2, Calendar, X, Check
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography, shadows } from '../../theme';
import { api } from '../../services/api';
import { Card } from '../../components/common/Card';
import { Avatar } from '../../components/common/Avatar';
import { Badge } from '../../components/common/Badge';
import { SearchField } from '../../components/common/SearchField';
import { SelectField } from '../../components/common/SelectField';
import { LoadingView } from '../../components/common/LoadingView';
import { EmptyState } from '../../components/common/EmptyState';
import { formatCurrency, monthName } from '../../utils/format';
import { downloadPdfToDevice } from '../../utils/pdf';
import { buildPayslipHtml } from '../../utils/payslipPdf';
import { COMPANY_OPTIONS } from '../../utils/companyConfig';

const CURRENT_YEAR = new Date().getFullYear();
const MONTH_LIST = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

const YEAR_LIST = Array.from({ length: 6 }, (_, i) => String(CURRENT_YEAR - i));
const COMPANY_FILTER_OPTIONS = [{ value: 'all', label: 'All Companies' }, ...COMPANY_OPTIONS];
const PAGE_SIZE = 20;

function MetaRow({ label, value, theme, valueColor, last }) {
  return (
    <View style={[styles.metaRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
      <Text style={[styles.metaLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: valueColor || theme.textPrimary }]}>{value || '—'}</Text>
    </View>
  );
}

function SectionCard({ title, rows, theme, positive }) {
  return (
    <Card style={styles.metaCard} elevated>
      <Text style={[styles.metaTitle, { color: theme.textPrimary }]}>{title}</Text>
      {rows.map(([label, value], idx) => (
        <MetaRow
          key={label}
          label={label}
          value={formatCurrency(value)}
          theme={theme}
          valueColor={positive ? theme.emerald : theme.rose}
          last={idx === rows.length - 1}
        />
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
          <Text style={[styles.backText, { color: theme.primary }]}>Salary Records</Text>
        </TouchableOpacity>

        {detail ? (
          <View style={styles.detailHeaderActions}>
            <TouchableOpacity onPress={download} disabled={downloading} style={[styles.headerActionBtn, { borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}>
              <Download size={15} color={theme.primary} />
              <Text style={[styles.headerActionText, { color: theme.primary }]}>{downloading ? 'Preparing…' : 'PDF'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirmDelete} disabled={deleting} style={[styles.headerActionBtn, { borderColor: theme.rose + '40', backgroundColor: theme.roseBg }]}>
              {deleting ? <ActivityIndicator size="small" color={theme.rose} /> : <Trash2 size={15} color={theme.rose} />}
              <Text style={[styles.headerActionText, { color: theme.rose }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {loading ? (
        <LoadingView label="Loading payslip details…" />
      ) : error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load payslip" message={error} tone="error" />
      ) : detail ? (
        <ScrollView contentContainerStyle={styles.detailContent}>
          <Card style={styles.detailHero} elevated>
            <Avatar name={detail.emp_name} uri={detail.photo} size={68} />
            <Text style={[styles.detailName, { color: theme.textPrimary }]}>{detail.emp_name}</Text>
            <Text style={[styles.detailMonth, { color: theme.textMuted }]}>
              EMP #{detail.emp_code} · {monthName(detail.month)} {detail.year}
            </Text>
            <Text style={[styles.detailNet, { color: theme.emerald }]}>{formatCurrency(detail.net_payable)}</Text>
            <Badge label="Disbursed" variant="emerald" style={{ marginTop: 8 }} />
          </Card>

          <SectionCard title="Earnings Breakdown" rows={earnings} theme={theme} positive />
          <SectionCard title="Deductions" rows={deductions} theme={theme} />

          <Card style={styles.metaCard} elevated>
            <Text style={[styles.metaTitle, { color: theme.textPrimary }]}>Attendance & Work</Text>
            <MetaRow label="Present Days" value={detail.present_days ?? '—'} theme={theme} />
            <MetaRow label="Paid Days" value={detail.paid_day ?? '—'} theme={theme} />
            <MetaRow label="Leave" value={detail.leave ?? '—'} theme={theme} />
            <MetaRow label="Gross Salary" value={formatCurrency(detail.gross_salary)} theme={theme} last />
          </Card>

          <Card style={styles.metaCard} elevated>
            <Text style={[styles.metaTitle, { color: theme.textPrimary }]}>Bank & Account</Text>
            <MetaRow label="Bank" value={detail.user?.bank_name || '—'} theme={theme} />
            <MetaRow label="Account No" value={detail.account_no || detail.user?.bank_account_no || '—'} theme={theme} />
            <MetaRow label="IFSC Code" value={detail.bank_ifsc || detail.user?.bank_ifsc_code || '—'} theme={theme} />
            <MetaRow label="PF No" value={detail.user?.pf_no || '—'} theme={theme} />
            <MetaRow label="ESI No" value={detail.user?.esi_no || '—'} theme={theme} last />
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
  const [year, setYear] = useState(String(CURRENT_YEAR));
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

  // Custom Month & Year Modal State
  const [pickerModalOpen, setPickerModalOpen] = useState(false);
  const [tempMonth, setTempMonth] = useState(month || '8');
  const [tempYear, setTempYear] = useState(year || String(CURRENT_YEAR));

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
      if (canSwitchCompany && companyFilter !== 'all') params.company_code = companyFilter;

      const res = await api.getAdminPayslips(params);
      if (myRequest !== requestId.current) return;
      if (res?.status !== false && res) {
        const list = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.data) ? res.data.data : [];
        setSlips((prev) => (append ? [...(Array.isArray(prev) ? prev : []), ...list] : list));
        setTotalNetPayable(res.total_net_payable || res.data?.total_net_payable || 0);
        setPage(res.pagination?.current_page || res.current_page || pageNum);
        setLastPage(res.pagination?.last_page || res.last_page || pageNum);
        setTotal(res.pagination?.total || res.total || list.length);
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

  const applyCustomPicker = () => {
    setMonth(tempMonth);
    setYear(tempYear);
    setPickerModalOpen(false);
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

  const isCustomActive = month !== '' || (year !== String(CURRENT_YEAR) && year !== '');

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* Executive Header & Summary */}
      <View style={styles.headerArea}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Salary Records</Text>
          {totalNetPayable > 0 ? (
            <View style={[styles.disbursedBadge, { backgroundColor: theme.emerald + '15' }]}>
              <Text style={[styles.disbursedText, { color: theme.emerald }]}>
                Total: {formatCurrency(totalNetPayable)}
              </Text>
            </View>
          ) : (
            <Badge label={`${total} Slips`} variant="primary" />
          )}
        </View>

        <SearchField value={search} onChangeText={setSearch} placeholder="Search employee name or code…" style={{ marginBottom: 10 }} />

        {/* Executive Pill Bar */}
        <View style={styles.pillBar}>
          {/* Pill 1: All Months */}
          <TouchableOpacity
            onPress={() => { setMonth(''); setYear(''); }}
            style={[
              styles.pill,
              { backgroundColor: !month ? theme.primary : theme.surfaceElevated, borderColor: !month ? theme.primary : theme.border },
            ]}
            activeOpacity={0.8}
          >
            <Text style={[styles.pillText, { color: !month ? '#FFFFFF' : theme.textMuted }]}>All Months</Text>
          </TouchableOpacity>

          {/* Pill 2: Select Specific Month & Year Button */}
          <TouchableOpacity
            onPress={() => {
              setTempMonth(month || '8');
              setTempYear(year || String(CURRENT_YEAR));
              setPickerModalOpen(true);
            }}
            style={[
              styles.pill,
              {
                backgroundColor: isCustomActive ? theme.violet : theme.surfaceElevated,
                borderColor: isCustomActive ? theme.violet : theme.border,
              },
            ]}
            activeOpacity={0.8}
          >
            <Calendar size={13} color={isCustomActive ? '#FFFFFF' : theme.textMuted} style={{ marginRight: 5 }} />
            <Text style={[styles.pillText, { color: isCustomActive ? '#FFFFFF' : theme.textMuted }]}>
              {month ? `${monthName(Number(month))} ${year || CURRENT_YEAR}` : 'Month & Year…'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Payslip List */}
      {loading ? (
        <LoadingView label="Loading salary records…" />
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
          renderItem={({ item }) => {
            const netVal = Number(item.net_payable) || 0;
            return (
              <TouchableOpacity activeOpacity={0.8} onPress={() => setSelectedId(item.id)} style={styles.cardWrap}>
                <Card style={styles.slipCard} elevated>
                  <View style={styles.slipRow}>
                    <Avatar name={item.emp_name || item.emp_code} uri={item.photo} size={44} />

                    <View style={styles.slipMid}>
                      <Text style={[styles.slipName, { color: theme.textPrimary }]} numberOfLines={1}>
                        {item.emp_name || item.emp_code}
                      </Text>
                      <Text style={[styles.slipMeta, { color: theme.textMuted }]} numberOfLines={1}>
                        ID #{item.emp_code} · {monthName(item.month)} {item.year}
                      </Text>
                    </View>

                    <View style={styles.slipRight}>
                      <Text style={[styles.slipAmount, { color: netVal > 0 ? theme.emerald : theme.textMuted }]}>
                        {formatCurrency(netVal)}
                      </Text>
                      <Badge label={netVal > 0 ? 'Disbursed' : 'Zero'} variant={netVal > 0 ? 'emerald' : 'default'} size="small" />
                    </View>

                    <ChevronRight size={18} color={theme.textMuted} style={{ marginLeft: 6 }} />
                  </View>
                </Card>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<EmptyState icon={Wallet} title="No salary records found" message="Try adjusting your month or search filters." />}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color={theme.primary} /> : null}
        />
      )}

      {/* Select Specific Month & Year Modal Sheet */}
      <Modal visible={pickerModalOpen} transparent animationType="slide" onRequestClose={() => setPickerModalOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPickerModalOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.modalSheet, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Select Specific Period</Text>
              <TouchableOpacity onPress={() => setPickerModalOpen(false)} hitSlop={8}>
                <X size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalLabel, { color: theme.textMuted }]}>Select Month</Text>
            <View style={styles.monthGrid}>
              {MONTH_LIST.map((m) => {
                const isSel = tempMonth === m.value;
                return (
                  <TouchableOpacity
                    key={m.value}
                    onPress={() => setTempMonth(m.value)}
                    style={[
                      styles.gridBtn,
                      { backgroundColor: isSel ? theme.primary : theme.surfaceElevated, borderColor: isSel ? theme.primary : theme.border },
                    ]}
                  >
                    <Text style={[styles.gridBtnText, { color: isSel ? '#FFFFFF' : theme.textPrimary }]}>
                      {m.label.slice(0, 3)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.modalLabel, { color: theme.textMuted, marginTop: 14 }]}>Select Year</Text>
            <View style={styles.yearGrid}>
              {YEAR_LIST.map((y) => {
                const isSel = tempYear === y;
                return (
                  <TouchableOpacity
                    key={y}
                    onPress={() => setTempYear(y)}
                    style={[
                      styles.yearBtn,
                      { backgroundColor: isSel ? theme.primary : theme.surfaceElevated, borderColor: isSel ? theme.primary : theme.border },
                    ]}
                  >
                    <Text style={[styles.gridBtnText, { color: isSel ? '#FFFFFF' : theme.textPrimary }]}>{y}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={[styles.applyBtn, { backgroundColor: theme.primary }]} onPress={applyCustomPicker} activeOpacity={0.8}>
              <Text style={styles.applyBtnText}>Apply Filter ({monthName(Number(tempMonth))} {tempYear})</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerArea: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { ...typography.h3, fontWeight: '800' },
  disbursedBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  disbursedText: { ...typography.micro, fontWeight: '800' },
  pillBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  pillText: { ...typography.micro, fontWeight: '700' },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 110 },
  cardWrap: { marginBottom: 10 },
  slipCard: { padding: 12, borderRadius: 16 },
  slipRow: { flexDirection: 'row', alignItems: 'center' },
  slipMid: { flex: 1, marginLeft: 12, marginRight: 8 },
  slipName: { ...typography.body, fontWeight: '700' },
  slipMeta: { ...typography.caption, marginTop: 2 },
  slipRight: { alignItems: 'flex-end', gap: 2 },
  slipAmount: { ...typography.body, fontWeight: '800' },
  detailHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, marginBottom: 12 },
  detailHeaderActions: { flexDirection: 'row', gap: 8 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { ...typography.body, fontWeight: '600' },
  headerActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  headerActionText: { ...typography.caption, fontWeight: '700' },
  detailContent: { paddingHorizontal: 16, paddingBottom: 110 },
  detailHero: { alignItems: 'center', paddingVertical: 20, marginBottom: 14, borderRadius: 20 },
  detailName: { ...typography.h3, fontWeight: '800', marginTop: 10 },
  detailMonth: { ...typography.caption, marginTop: 4, marginBottom: 10 },
  detailNet: { ...typography.h1, fontSize: 30, fontWeight: '800' },
  metaCard: { marginBottom: 12, padding: 14, borderRadius: 16 },
  metaTitle: { ...typography.h4, marginBottom: 10 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  metaLabel: { ...typography.caption },
  metaValue: { ...typography.body, fontWeight: '700' },

  // Custom Modal Sheet Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { ...typography.h3, fontWeight: '800' },
  modalLabel: { ...typography.caption, fontWeight: '700', marginBottom: 8 },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  gridBtn: { width: '23%', paddingVertical: 10, alignItems: 'center', borderRadius: 10, borderWidth: 1 },
  gridBtnText: { ...typography.micro, fontWeight: '700' },
  yearGrid: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  yearBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, borderWidth: 1 },
  applyBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  applyBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});
