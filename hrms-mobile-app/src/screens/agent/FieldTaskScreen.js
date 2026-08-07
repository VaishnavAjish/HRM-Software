import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput } from 'react-native';
import { MapPin, Navigation, CheckCircle2, Camera, Clock, Building, X } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { typography, shadows } from '../../theme';
import { api } from '../../services/api';

export function FieldTaskScreen() {
  const { theme } = useTheme();
  const [tasks, setTasks] = useState([]);
  const [activeTask, setActiveTask] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [reportNotes, setReportNotes] = useState('');
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    const data = await api.getFieldTasks();
    setTasks(data);
  };

  const handleStartTask = (t) => {
    setActiveTask(t);
    setModalVisible(true);
  };

  const handleCompleteTask = () => {
    setTasks((prev) =>
      prev.map((t) => (t.id === activeTask.id ? { ...t, status: 'Completed' } : t))
    );
    setCompleted(true);
    setTimeout(() => {
      setCompleted(false);
      setModalVisible(false);
      setReportNotes('');
    }, 1200);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>

      <Text style={[styles.pageTitle, { color: theme.textPrimary }]}>Field Visit & Onsite Tasks</Text>
      <Text style={[styles.pageSubtitle, { color: theme.textMuted }]}>GPS Verified Field Agent Operations</Text>

      {tasks.map((item) => (
        <Card key={item.id} style={styles.taskCard} glass>
          <View style={styles.topRow}>
            <Text style={[styles.taskId, { color: theme.emerald }]}>{item.id}</Text>
            <Badge label={item.status} variant={item.status === 'Completed' ? 'emerald' : 'amber'} size="small" />
          </View>

          <Text style={[styles.taskTitle, { color: theme.textPrimary }]}>{item.title}</Text>
          <Text style={[styles.clientName, { color: theme.textSecondary }]}>{item.client}</Text>

          <View style={styles.addressBox}>
            <MapPin size={14} color={theme.emerald} />
            <Text style={[styles.addressText, { color: theme.textMuted }]}>{item.address}</Text>
          </View>

          <View style={styles.instructBox}>
            <Text style={[styles.instructText, { color: theme.textSecondary }]}>
              Target GPS: {item.gpsTarget}
            </Text>
            <Text style={[styles.instructDetail, { color: theme.textMuted }]}>"{item.instructions}"</Text>
          </View>

          {item.status !== 'Completed' && (
            <Button
              title="Check In & Complete Visit"
              variant="emerald"
              icon={Navigation}
              onPress={() => handleStartTask(item)}
              style={{ marginTop: 12 }}
            />
          )}
        </Card>
      ))}

      {/* Field Visit Completion Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Onsite GPS Verification</Text>
                <Text style={[styles.modalSub, { color: theme.textMuted }]}>{activeTask?.title}</Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            {completed ? (
              <View style={styles.successState}>
                <CheckCircle2 size={48} color={theme.emerald} />
                <Text style={[styles.successTitle, { color: theme.textPrimary }]}>Visit Verified & Completed!</Text>
                <Text style={[styles.successDesc, { color: theme.textMuted }]}>GPS coordinates and report synced.</Text>
              </View>
            ) : (
              <>
                <View style={styles.gpsVerifiedBadge}>
                  <MapPin size={16} color={theme.emerald} />
                  <Text style={styles.gpsVerifiedText}>Current Location Verified: {activeTask?.gpsTarget}</Text>
                </View>

                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Field Audit Summary Report</Text>
                <View style={[styles.textAreaBox, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                  <TextInput
                    style={[styles.inputText, { color: theme.textPrimary }]}
                    value={reportNotes}
                    onChangeText={setReportNotes}
                    placeholder="Enter inspection results or hardware serial barcodes..."
                    placeholderTextColor={theme.textMuted}
                    multiline
                    numberOfLines={3}
                  />
                </View>

                <Button
                  title="Submit Onsite Visit Report"
                  variant="emerald"
                  onPress={handleCompleteTask}
                  disabled={!reportNotes}
                  style={{ marginTop: 14 }}
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
  pageTitle: {
    ...typography.h2,
  },
  pageSubtitle: {
    ...typography.caption,
    marginBottom: 16,
  },
  taskCard: {
    marginBottom: 12,
    padding: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  taskId: {
    ...typography.h4,
    fontWeight: '800',
  },
  taskTitle: {
    ...typography.h4,
    marginBottom: 2,
  },
  clientName: {
    ...typography.caption,
    fontWeight: '700',
    marginBottom: 8,
  },
  addressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  addressText: {
    ...typography.caption,
  },
  instructBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    padding: 10,
    borderRadius: 12,
    marginBottom: 4,
  },
  instructText: {
    ...typography.micro,
    fontWeight: '700',
  },
  instructDetail: {
    ...typography.caption,
    fontStyle: 'italic',
    marginTop: 2,
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
    marginBottom: 14,
  },
  modalTitle: {
    ...typography.h3,
  },
  modalSub: {
    ...typography.caption,
  },
  gpsVerifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    padding: 10,
    borderRadius: 12,
    gap: 8,
    marginBottom: 14,
  },
  gpsVerifiedText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
  },
  inputLabel: {
    ...typography.caption,
    fontWeight: '600',
    marginBottom: 6,
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
