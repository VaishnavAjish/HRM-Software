import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput } from 'react-native';
import { Clock, MapPin, Calendar as CalendarIcon, CheckCircle2, AlertCircle, FilePlus, X } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { typography, shadows } from '../../theme';
import { api } from '../../services/api';

export function AttendanceScreen() {
  const { theme } = useTheme();
  const [attendance, setAttendance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [regModalVisible, setRegModalVisible] = useState(false);
  const [regDate, setRegDate] = useState('Wed, Aug 05');
  const [regReason, setRegReason] = useState('');
  const [regSuccess, setRegSuccess] = useState(false);

  useEffect(() => {
    loadAttendance();
  }, []);

  const loadAttendance = async () => {
    const data = await api.getAttendance();
    setAttendance(data);
  };

  const handlePunchToggle = async () => {
    setLoading(true);
    if (attendance?.isPunchedIn) {
      await api.punchOut();
    } else {
      await api.punchIn();
    }
    await loadAttendance();
    setLoading(false);
  };

  const handleSubmitRegularization = () => {
    if (!regReason) return;
    setRegSuccess(true);
    setTimeout(() => {
      setRegSuccess(false);
      setRegModalVisible(false);
      setRegReason('');
    }, 1500);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>

      {/* Main Shift Status Card */}
      <Card style={styles.shiftCard} glass>
        <View style={styles.cardHeaderRow}>
          <View>
            <Text style={[styles.shiftName, { color: theme.textPrimary }]}>{attendance?.shiftName || 'Standard Shift'}</Text>
            <Text style={[styles.shiftTiming, { color: theme.textMuted }]}>{attendance?.shiftTiming || '09:00 AM - 06:00 PM'}</Text>
          </View>
          <Badge label={attendance?.isPunchedIn ? 'PUNCHED IN' : 'OFF DUTY'} variant={attendance?.isPunchedIn ? 'emerald' : 'amber'} />
        </View>

        <View style={styles.timerRow}>
          <Text style={[styles.timerValue, { color: theme.textPrimary }]}>
            {attendance?.isPunchedIn ? attendance?.totalHoursToday : '00h 00m'}
          </Text>
          <Text style={[styles.timerSub, { color: theme.textMuted }]}>
            {attendance?.isPunchedIn ? `Punched in at ${attendance?.punchInTime}` : 'Ready to start shift'}
          </Text>
        </View>

        <View style={styles.gpsRow}>
          <MapPin size={14} color={theme.emerald} />
          <Text style={[styles.gpsText, { color: theme.textMuted }]}>
            GPS Location: {attendance?.location}
          </Text>
        </View>

        <Button
          title={attendance?.isPunchedIn ? 'Punch Out & End Shift' : 'Punch In (GPS Verified)'}
          variant={attendance?.isPunchedIn ? 'rose' : 'emerald'}
          onPress={handlePunchToggle}
          loading={loading}
          icon={Clock}
          style={styles.punchBtn}
        />
      </Card>

      {/* Monthly Summary Statistics Grid */}
      <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>August 2026 Summary</Text>
      <View style={styles.summaryGrid}>
        <View style={[styles.summaryBox, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
          <Text style={[styles.sumValue, { color: theme.emerald }]}>{attendance?.monthlySummary?.present ?? 22}</Text>
          <Text style={[styles.sumLabel, { color: theme.textMuted }]}>Days Present</Text>
        </View>

        <View style={[styles.summaryBox, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
          <Text style={[styles.sumValue, { color: theme.amber }]}>{attendance?.monthlySummary?.lateCount ?? 1}</Text>
          <Text style={[styles.sumLabel, { color: theme.textMuted }]}>Late Check-ins</Text>
        </View>

        <View style={[styles.summaryBox, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
          <Text style={[styles.sumValue, { color: theme.cyan }]}>{attendance?.monthlySummary?.leaves ?? 2}</Text>
          <Text style={[styles.sumLabel, { color: theme.textMuted }]}>Leaves Taken</Text>
        </View>

        <View style={[styles.summaryBox, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
          <Text style={[styles.sumValue, { color: theme.primary }]}>{attendance?.monthlySummary?.overtimeHours ?? '14.5h'}</Text>
          <Text style={[styles.sumLabel, { color: theme.textMuted }]}>Overtime</Text>
        </View>
      </View>

      {/* Recent Punch Logs Header & Regularize Action */}
      <View style={styles.logsHeaderRow}>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginBottom: 0 }]}>Recent Logs</Text>
        <TouchableOpacity
          style={[styles.regBtn, { backgroundColor: theme.primary + '18', borderColor: theme.primary + '40' }]}
          onPress={() => setRegModalVisible(true)}
        >
          <FilePlus size={14} color={theme.primary} />
          <Text style={[styles.regBtnText, { color: theme.primary }]}>Regularize Punch</Text>
        </TouchableOpacity>
      </View>

      {/* Attendance Logs List */}
      {attendance?.recentLogs?.map((log, index) => (
        <Card key={index} style={styles.logCard} glass>
          <View style={styles.logTopRow}>
            <View style={styles.logDateGroup}>
              <CalendarIcon size={16} color={theme.primary} />
              <Text style={[styles.logDate, { color: theme.textPrimary }]}>{log.date}</Text>
            </View>
            <Badge label={log.status} variant={log.status === 'Present' ? 'emerald' : log.status === 'Late Check-in' ? 'amber' : 'violet'} size="small" />
          </View>

          <View style={styles.logTimesRow}>
            <View>
              <Text style={[styles.timeLabel, { color: theme.textMuted }]}>IN TIME</Text>
              <Text style={[styles.timeVal, { color: theme.textPrimary }]}>{log.punchIn}</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <View>
              <Text style={[styles.timeLabel, { color: theme.textMuted }]}>OUT TIME</Text>
              <Text style={[styles.timeVal, { color: theme.textPrimary }]}>{log.punchOut}</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <View>
              <Text style={[styles.timeLabel, { color: theme.textMuted }]}>TOTAL HOURS</Text>
              <Text style={[styles.timeVal, { color: theme.primary }]}>{log.hours}</Text>
            </View>
          </View>
        </Card>
      ))}

      {/* Attendance Regularization Modal */}
      <Modal visible={regModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Request Punch Regularization</Text>
              <TouchableOpacity onPress={() => setRegModalVisible(false)}>
                <X size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            {regSuccess ? (
              <View style={styles.successState}>
                <CheckCircle2 size={48} color={theme.emerald} />
                <Text style={[styles.successTitle, { color: theme.textPrimary }]}>Request Submitted!</Text>
                <Text style={[styles.successDesc, { color: theme.textMuted }]}>Sent to manager for approval.</Text>
              </View>
            ) : (
              <>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Select Affected Date</Text>
                <View style={[styles.inputBox, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                  <TextInput
                    style={[styles.inputText, { color: theme.textPrimary }]}
                    value={regDate}
                    onChangeText={setRegDate}
                  />
                </View>

                <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 12 }]}>Reason for Missed / Late Punch</Text>
                <View style={[styles.textAreaBox, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                  <TextInput
                    style={[styles.inputText, { color: theme.textPrimary }]}
                    value={regReason}
                    onChangeText={setRegReason}
                    placeholder="e.g. Onsite client meeting or biometric reader failure..."
                    placeholderTextColor={theme.textMuted}
                    multiline
                    numberOfLines={3}
                  />
                </View>

                <Button
                  title="Submit Regularization"
                  onPress={handleSubmitRegularization}
                  disabled={!regReason}
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
  shiftCard: {
    marginBottom: 20,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  shiftName: {
    ...typography.h3,
  },
  shiftTiming: {
    ...typography.caption,
    marginTop: 2,
  },
  timerRow: {
    alignItems: 'center',
    marginVertical: 12,
  },
  timerValue: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
  },
  timerSub: {
    ...typography.caption,
    marginTop: 4,
  },
  gpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 16,
  },
  gpsText: {
    ...typography.caption,
  },
  punchBtn: {
    marginTop: 4,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 22,
  },
  summaryBox: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  sumValue: {
    ...typography.h2,
    fontWeight: '800',
  },
  sumLabel: {
    ...typography.micro,
    marginTop: 2,
    textAlign: 'center',
  },
  logsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  regBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  regBtnText: {
    ...typography.caption,
    fontWeight: '600',
  },
  logCard: {
    marginBottom: 10,
    padding: 14,
  },
  logTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  logDateGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logDate: {
    ...typography.h4,
  },
  logTimesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  timeLabel: {
    ...typography.micro,
  },
  timeVal: {
    ...typography.caption,
    fontWeight: '700',
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 24,
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
