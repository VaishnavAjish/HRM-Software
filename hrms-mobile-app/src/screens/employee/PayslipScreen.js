import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { FileText, Download, Lock, CheckCircle2, ChevronRight, Building, DollarSign, X } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { typography, shadows } from '../../theme';
import { api } from '../../services/api';

export function PayslipScreen() {
  const { theme } = useTheme();
  const [payslips, setPayslips] = useState([]);
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  useEffect(() => {
    loadPayslips();
  }, []);

  const loadPayslips = async () => {
    const data = await api.getPayslips();
    setPayslips(data);
  };

  const handleOpenSlip = (slip) => {
    setSelectedSlip(slip);
    setModalVisible(true);
  };

  const handleSimulateDownload = () => {
    setDownloading(true);
    setTimeout(() => {
      setDownloading(false);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 2000);
    }, 1000);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>

      {/* Top Banner */}
      <View style={styles.headerArea}>
        <Text style={[styles.pageTitle, { color: theme.textPrimary }]}>Salary Slips & Payroll</Text>
        <Text style={[styles.pageSubtitle, { color: theme.textMuted }]}>Confidential Digital Compensation Records</Text>
      </View>

      {/* Latest Net Pay Summary Card */}
      {payslips.length > 0 && (
        <Card style={styles.latestPayCard} glass>
          <View style={styles.latestHeader}>
            <Text style={styles.latestMonthLabel}>{payslips[0].monthYear} (Latest)</Text>
            <Badge label={payslips[0].paymentStatus} variant="emerald" size="small" />
          </View>

          <Text style={styles.netPayLabel}>TOTAL NET SALARY DISBURSED</Text>
          <Text style={styles.netPayAmount}>{payslips[0].netPay}</Text>

          <View style={styles.latestFooterRow}>
            <Text style={styles.bankText}>{payslips[0].bankName} ({payslips[0].accountEnding})</Text>
            <TouchableOpacity style={styles.viewBtn} onPress={() => handleOpenSlip(payslips[0])}>
              <Text style={styles.viewBtnText}>View Breakdown</Text>
              <ChevronRight size={14} color="#818CF8" />
            </TouchableOpacity>
          </View>
        </Card>
      )}

      {/* Monthly Payslips History List */}
      <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Payroll History</Text>

      {payslips.map((item) => (
        <TouchableOpacity key={item.id} onPress={() => handleOpenSlip(item)} activeOpacity={0.8}>
          <Card style={styles.slipCard} glass>
            <View style={styles.slipRow}>
              <View style={[styles.slipIconCircle, { backgroundColor: theme.primary + '18' }]}>
                <FileText size={20} color={theme.primary} />
              </View>

              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.slipMonthTitle, { color: theme.textPrimary }]}>{item.monthYear}</Text>
                <Text style={[styles.slipPeriod, { color: theme.textMuted }]}>{item.payPeriod}</Text>
              </View>

              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.slipNet, { color: theme.textPrimary }]}>{item.netPay}</Text>
                <Badge label="Paid" variant="emerald" size="small" style={{ marginTop: 2 }} />
              </View>
            </View>
          </Card>
        </TouchableOpacity>
      ))}

      {/* Detailed Salary Slip Breakdown Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>{selectedSlip?.monthYear} Payslip</Text>
                <Text style={[styles.modalSub, { color: theme.textMuted }]}>ID: {selectedSlip?.id}</Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>

              {/* Net Pay Card */}
              <View style={styles.modalNetBox}>
                <Text style={styles.modalNetLabel}>NET TAKE HOME SALARY</Text>
                <Text style={styles.modalNetVal}>{selectedSlip?.netPay}</Text>
                <Text style={styles.modalNetSub}>Disbursed on {selectedSlip?.paymentDate} via Direct Deposit</Text>
              </View>

              {/* Earnings Section */}
              <Text style={[styles.breakdownHeader, { color: theme.emerald }]}>EARNINGS BREAKDOWN</Text>
              {selectedSlip?.earnings?.map((e, idx) => (
                <View key={idx} style={[styles.itemRow, { borderBottomColor: theme.border }]}>
                  <Text style={[styles.itemName, { color: theme.textSecondary }]}>{e.name}</Text>
                  <Text style={[styles.itemVal, { color: theme.textPrimary }]}>{e.amount}</Text>
                </View>
              ))}
              <View style={[styles.totalRow, { backgroundColor: theme.emeraldBg }]}>
                <Text style={[styles.totalLabel, { color: theme.emerald }]}>GROSS PAY</Text>
                <Text style={[styles.totalVal, { color: theme.emerald }]}>{selectedSlip?.grossPay}</Text>
              </View>

              {/* Deductions Section */}
              <Text style={[styles.breakdownHeader, { color: theme.rose, marginTop: 14 }]}>DEDUCTIONS BREAKDOWN</Text>
              {selectedSlip?.deductions?.map((d, idx) => (
                <View key={idx} style={[styles.itemRow, { borderBottomColor: theme.border }]}>
                  <Text style={[styles.itemName, { color: theme.textSecondary }]}>{d.name}</Text>
                  <Text style={[styles.itemVal, { color: theme.rose }]}>-{d.amount}</Text>
                </View>
              ))}
              <View style={[styles.totalRow, { backgroundColor: theme.roseBg }]}>
                <Text style={[styles.totalLabel, { color: theme.rose }]}>TOTAL DEDUCTIONS</Text>
                <Text style={[styles.totalVal, { color: theme.rose }]}>-{selectedSlip?.totalDeductions}</Text>
              </View>

            </ScrollView>

            {/* Action Footer */}
            <View style={styles.modalFooterAction}>
              {downloadSuccess ? (
                <View style={styles.downloadDoneBadge}>
                  <CheckCircle2 size={16} color={theme.emerald} />
                  <Text style={[styles.downloadDoneText, { color: theme.emerald }]}>PDF Payslip Saved to Downloads!</Text>
                </View>
              ) : (
                <Button
                  title="Download PDF Payslip"
                  icon={Download}
                  onPress={handleSimulateDownload}
                  loading={downloading}
                  variant="gradient"
                />
              )}
            </View>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 18,
    paddingBottom: 100,
  },
  headerArea: {
    marginBottom: 16,
  },
  pageTitle: {
    ...typography.h2,
  },
  pageSubtitle: {
    ...typography.caption,
  },
  latestPayCard: {
    backgroundColor: '#1E1B4B',
    padding: 20,
    borderRadius: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  latestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  latestMonthLabel: {
    color: '#A5B4FC',
    fontSize: 13,
    fontWeight: '700',
  },
  netPayLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  netPayAmount: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    marginVertical: 4,
  },
  latestFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
    paddingTop: 12,
    marginTop: 8,
  },
  bankText: {
    color: '#CBD5E1',
    fontSize: 11,
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewBtnText: {
    color: '#818CF8',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: 12,
  },
  slipCard: {
    marginBottom: 10,
    padding: 14,
  },
  slipRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  slipIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slipMonthTitle: {
    ...typography.h4,
  },
  slipPeriod: {
    ...typography.caption,
  },
  slipNet: {
    ...typography.h4,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    borderWidth: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    ...typography.h3,
  },
  modalSub: {
    ...typography.caption,
  },
  modalNetBox: {
    backgroundColor: '#312E81',
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  modalNetLabel: {
    color: '#A5B4FC',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  modalNetVal: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    marginVertical: 2,
  },
  modalNetSub: {
    color: '#CBD5E1',
    fontSize: 11,
  },
  breakdownHeader: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  itemName: {
    ...typography.caption,
  },
  itemVal: {
    ...typography.caption,
    fontWeight: '700',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 12,
    marginTop: 6,
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  totalVal: {
    fontSize: 14,
    fontWeight: '800',
  },
  modalFooterAction: {
    marginTop: 16,
  },
  downloadDoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  downloadDoneText: {
    ...typography.caption,
    fontWeight: '700',
  },
});
