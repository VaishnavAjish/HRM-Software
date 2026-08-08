import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { FileText, ChevronLeft, AlertCircle, ChevronRight, Download } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { api } from '../../services/api';
import { typography } from '../../theme';
import { Card } from '../../components/common/Card';
import { LoadingView } from '../../components/common/LoadingView';
import { EmptyState } from '../../components/common/EmptyState';
import { formatCurrency, monthName } from '../../utils/format';
import { downloadPdfToDevice } from '../../utils/pdf';
import { buildPayslipHtml } from '../../utils/payslipPdf';

export function PayslipScreen() {
  const { theme } = useTheme();
  const [slips, setSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const res = await api.getPayslips({ limit: 50 });
      if (res?.status) {
        setSlips(res.data || []);
      } else {
        setError(res?.message || 'Could not load payslips.');
      }
    } catch (e) {
      setError(e.message || 'Could not load payslips.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (selectedId) {
    return <PayslipDetail id={selectedId} onBack={() => setSelectedId(null)} />;
  }

  if (loading) return <LoadingView fullscreen label="Loading payslips…" />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.primary} />}
    >
      {error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load payslips" message={error} tone="error" actionLabel="Retry" onAction={() => load()} />
      ) : slips.length === 0 ? (
        <EmptyState icon={FileText} title="No payslips yet" message="Your payslips will appear here once HR issues them." />
      ) : (
        slips.map((slip) => (
          <TouchableOpacity key={slip.id} activeOpacity={0.8} onPress={() => setSelectedId(slip.id)}>
            <Card style={styles.slipCard} elevated>
              <View style={styles.slipRow}>
                <View style={[styles.slipIconWrap, { backgroundColor: theme.emeraldBg }]}>
                  <FileText size={18} color={theme.emerald} />
                </View>
                <View style={styles.slipMid}>
                  <Text style={[styles.slipMonth, { color: theme.textPrimary }]}>
                    {monthName(slip.month)} {slip.year}
                  </Text>
                  <Text style={[styles.slipDept, { color: theme.textMuted }]}>
                    Gross {formatCurrency(slip.gross_salary)}
                  </Text>
                </View>
                <View style={styles.slipRight}>
                  <Text style={[styles.slipAmount, { color: theme.emerald }]}>{formatCurrency(slip.net_payable)}</Text>
                  <ChevronRight size={16} color={theme.textMuted} />
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

function PayslipDetail({ id, onBack }) {
  const { theme } = useTheme();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    if (!detail) return;
    setDownloading(true);
    try {
      const html = buildPayslipHtml(detail);
      const { saved } = await downloadPdfToDevice(html, `Payslip ${monthName(detail.month)} ${detail.year}`);
      if (saved) Alert.alert('Saved', 'The payslip PDF was saved to your device.');
    } catch (e) {
      Alert.alert('Could not generate PDF', e.message || 'Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getPayslipDetail(id);
        if (res?.status) setDetail(res.data);
        else setError(res?.message || 'Could not load this payslip.');
      } catch (e) {
        setError(e.message || 'Could not load this payslip.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const earnings = detail
    ? [
        ['Basic', detail.basic],
        ['DA', detail.da],
        ['HRA', detail.hra],
      ]
    : [];
  const deductions = detail
    ? [
        ['PF', detail.pf],
        ['ESI', detail.esi],
        ['TDS', detail.tds],
        ['Advance', detail.advance],
      ]
    : [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.detailHeaderRow}>
        <TouchableOpacity onPress={onBack} style={styles.backRow} activeOpacity={0.7}>
          <ChevronLeft size={18} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary }]}>All payslips</Text>
        </TouchableOpacity>

        {detail ? (
          <TouchableOpacity onPress={download} disabled={downloading} style={[styles.downloadBtn, { borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}>
            <Download size={15} color={theme.primary} />
            <Text style={[styles.downloadText, { color: theme.primary }]}>{downloading ? 'Preparing…' : 'Download'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <LoadingView label="Loading payslip…" />
      ) : error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load payslip" message={error} tone="error" />
      ) : detail ? (
        <>
          <Card style={styles.detailHero} elevated>
            <Text style={[styles.detailMonth, { color: theme.textPrimary }]}>
              {monthName(detail.month)} {detail.year}
            </Text>
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
        </>
      ) : null}
    </ScrollView>
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

function MetaRow({ label, value, theme, valueColor }) {
  return (
    <View style={styles.metaRow}>
      <Text style={[styles.metaLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: valueColor || theme.textPrimary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 120,
  },
  slipCard: {
    marginBottom: 10,
    padding: 14,
  },
  slipRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  slipIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  slipMid: {
    flex: 1,
  },
  slipMonth: {
    ...typography.h4,
    marginBottom: 2,
  },
  slipDept: {
    ...typography.caption,
  },
  slipRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  slipAmount: {
    ...typography.h4,
  },
  detailHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    ...typography.body,
    fontWeight: '600',
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  downloadText: {
    ...typography.caption,
    fontWeight: '700',
  },
  detailHero: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 16,
  },
  detailMonth: {
    ...typography.h3,
    marginBottom: 8,
  },
  detailNet: {
    ...typography.h1,
    fontSize: 32,
  },
  detailNetLabel: {
    ...typography.caption,
    marginTop: 4,
  },
  metaCard: {
    marginBottom: 16,
    padding: 18,
  },
  metaTitle: {
    ...typography.h4,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  metaLabel: {
    ...typography.body,
  },
  metaValue: {
    ...typography.body,
    fontWeight: '600',
  },
});
