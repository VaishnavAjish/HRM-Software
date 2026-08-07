import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput } from 'react-native';
import { Calendar, Plus, CheckCircle2, Clock, User, X } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { typography, shadows } from '../../theme';
import { api } from '../../services/api';

export function LeaveScreen() {
  const { theme } = useTheme();
  const [leavesData, setLeavesData] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedType, setSelectedType] = useState('Casual Leave');
  const [startDate, setStartDate] = useState('18 Aug 2026');
  const [endDate, setEndDate] = useState('20 Aug 2026');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    loadLeaves();
  }, []);

  const loadLeaves = async () => {
    const data = await api.getLeaves();
    setLeavesData(data);
  };

  const handleApplyLeave = async () => {
    if (!reason) return;
    setLoading(true);
    await api.applyLeave({ type: selectedType, startDate, endDate, reason });
    await loadLeaves();
    setLoading(false);
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setModalVisible(false);
      setReason('');
    }, 1200);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>

      {/* Top Banner & Apply Leave Action */}
      <View style={styles.headerBannerRow}>
        <View>
          <Text style={[styles.pageTitle, { color: theme.textPrimary }]}>Leave Balance</Text>
          <Text style={[styles.pageSubtitle, { color: theme.textMuted }]}>FY 2026-2027 Quotas</Text>
        </View>
        <Button
          title="Apply Leave"
          icon={Plus}
          onPress={() => setModalVisible(true)}
          size="small"
        />
      </View>

      {/* Quotas Carousel Cards */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quotaScroll}>
        {leavesData?.quotas?.map((quota, idx) => {
          const percent = Math.round((quota.remaining / quota.total) * 100);

          return (
            <Card key={idx} style={[styles.quotaCard, { backgroundColor: quota.bg }]} glass>
              <View style={styles.quotaHeader}>
                <View style={[styles.quotaCodeBadge, { backgroundColor: quota.color }]}>
                  <Text style={styles.quotaCodeText}>{quota.code}</Text>
                </View>
                <Text style={[styles.quotaRemaining, { color: theme.textPrimary }]}>
                  {quota.remaining} <Text style={{ fontSize: 13, color: theme.textMuted }}>/ {quota.total} Days</Text>
                </Text>
              </View>

              <Text style={[styles.quotaTypeTitle, { color: theme.textPrimary }]}>{quota.type}</Text>

              {/* Progress Bar */}
              <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
                <View style={[styles.progressBar, { width: `${percent}%`, backgroundColor: quota.color }]} />
              </View>
              <Text style={[styles.quotaSub, { color: theme.textMuted }]}>{percent}% Balance Available</Text>
            </Card>
          );
        })}
      </ScrollView>

      {/* Leave History List */}
      <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginTop: 10 }]}>Recent Applications</Text>

      {leavesData?.applications?.map((item) => (
        <Card key={item.id} style={styles.historyCard} glass>
          <View style={styles.historyTopRow}>
            <View style={styles.typeGroup}>
              <Calendar size={16} color={theme.primary} />
              <Text style={[styles.historyType, { color: theme.textPrimary }]}>{item.type}</Text>
            </View>
            <Badge label={item.status} variant={item.status === 'Approved' ? 'emerald' : 'amber'} size="small" />
          </View>

          <Text style={[styles.historyDates, { color: theme.textPrimary }]}>{item.dates}</Text>
          <Text style={[styles.historyReason, { color: theme.textSecondary }]}>"{item.reason}"</Text>

          <View style={styles.historyFooter}>
            <Text style={[styles.historyMeta, { color: theme.textMuted }]}>Applied: {item.appliedOn}</Text>
            <Text style={[styles.historyMeta, { color: theme.textMuted }]}>Approver: {item.approvedBy}</Text>
          </View>
        </Card>
      ))}

      {/* Apply Leave Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Request Leave Application</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            {submitted ? (
              <View style={styles.successState}>
                <CheckCircle2 size={48} color={theme.emerald} />
                <Text style={[styles.successTitle, { color: theme.textPrimary }]}>Leave Applied!</Text>
                <Text style={[styles.successDesc, { color: theme.textMuted }]}>Application sent to manager for approval.</Text>
              </View>
            ) : (
              <>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Leave Category</Text>
                <View style={styles.typeSelectorRow}>
                  {['Casual Leave', 'Sick Leave', 'Earned Leave'].map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[
                        styles.typePill,
                        {
                          backgroundColor: selectedType === t ? theme.primary + '20' : theme.surfaceElevated,
                          borderColor: selectedType === t ? theme.primary : theme.border,
                        },
                      ]}
                      onPress={() => setSelectedType(t)}
                    >
                      <Text style={[styles.typePillText, { color: selectedType === t ? theme.primary : theme.textMuted }]}>{t.split(' ')[0]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.dateRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Start Date</Text>
                    <View style={[styles.inputBox, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                      <TextInput style={[styles.inputText, { color: theme.textPrimary }]} value={startDate} onChangeText={setStartDate} />
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>End Date</Text>
                    <View style={[styles.inputBox, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                      <TextInput style={[styles.inputText, { color: theme.textPrimary }]} value={endDate} onChangeText={setEndDate} />
                    </View>
                  </View>
                </View>

                <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 12 }]}>Reason for Leave</Text>
                <View style={[styles.textAreaBox, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                  <TextInput
                    style={[styles.inputText, { color: theme.textPrimary }]}
                    value={reason}
                    onChangeText={setReason}
                    placeholder="Provide details for leave request..."
                    placeholderTextColor={theme.textMuted}
                    multiline
                    numberOfLines={3}
                  />
                </View>

                <Button
                  title="Submit Application"
                  onPress={handleApplyLeave}
                  loading={loading}
                  disabled={!reason}
                  style={{ marginTop: 18 }}
                />
              </>
            )}
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
  headerBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  pageTitle: {
    ...typography.h2,
  },
  pageSubtitle: {
    ...typography.caption,
  },
  quotaScroll: {
    gap: 12,
    paddingBottom: 8,
    marginBottom: 14,
  },
  quotaCard: {
    width: 200,
    padding: 16,
    borderRadius: 22,
  },
  quotaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  quotaCodeBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quotaCodeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  quotaRemaining: {
    ...typography.h3,
    fontWeight: '800',
  },
  quotaTypeTitle: {
    ...typography.h4,
    marginBottom: 10,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  quotaSub: {
    ...typography.micro,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: 12,
  },
  historyCard: {
    marginBottom: 12,
    padding: 16,
  },
  historyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  typeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyType: {
    ...typography.h4,
  },
  historyDates: {
    ...typography.body,
    fontWeight: '700',
    marginBottom: 4,
  },
  historyReason: {
    ...typography.caption,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  historyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 8,
  },
  historyMeta: {
    ...typography.micro,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
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
  inputLabel: {
    ...typography.caption,
    fontWeight: '600',
    marginBottom: 6,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  typePill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  typePillText: {
    ...typography.caption,
    fontWeight: '700',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inputBox: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  textAreaBox: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    height: 80,
  },
  inputText: {
    fontSize: 14,
  },
  successState: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  successTitle: {
    ...typography.h2,
    marginTop: 12,
  },
  successDesc: {
    ...typography.body,
    marginTop: 4,
  },
});
