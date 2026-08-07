import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput } from 'react-native';
import { Ticket, Plus, Clock, MessageSquare, AlertTriangle, CheckCircle2, Shield, X } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { typography, shadows } from '../../theme';
import { api } from '../../services/api';

export function TicketScreen() {
  const { theme } = useTheme();
  const [tickets, setTickets] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [department, setDepartment] = useState('IT Support');
  const [priority, setPriority] = useState('Medium');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    loadTickets();
  }, []);

  const loadTickets = async () => {
    const data = await api.getTickets();
    setTickets([...data]);
  };

  const handleCreateTicket = async () => {
    if (!subject || !description) return;
    setLoading(true);
    await api.createTicket({ department, category: department, priority, subject, description });
    await loadTickets();
    setLoading(false);
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setModalVisible(false);
      setSubject('');
      setDescription('');
    }, 1200);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>

      {/* Header Row */}
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.pageTitle, { color: theme.textPrimary }]}>Enterprise Ticket Center</Text>
          <Text style={[styles.pageSubtitle, { color: theme.textMuted }]}>Internal HR, IT & Payroll Desk</Text>
        </View>
        <Button
          title="Raise Ticket"
          icon={Plus}
          onPress={() => setModalVisible(true)}
          size="small"
        />
      </View>

      {/* Tickets List */}
      {tickets.map((t) => (
        <Card key={t.id} style={styles.ticketCard} glass>
          <View style={styles.ticketTopRow}>
            <Text style={[styles.ticketId, { color: theme.primary }]}>{t.id}</Text>
            <View style={styles.badgeGroup}>
              <Badge label={t.priority} variant={t.priority} size="small" />
              <Badge label={t.status} variant={t.status} size="small" />
            </View>
          </View>

          <Text style={[styles.ticketSubject, { color: theme.textPrimary }]}>{t.subject}</Text>
          <Text style={[styles.ticketDesc, { color: theme.textSecondary }]} numberOfLines={2}>{t.description}</Text>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Shield size={13} color={theme.textMuted} />
              <Text style={[styles.metaText, { color: theme.textMuted }]}>{t.department}</Text>
            </View>

            <View style={styles.metaItem}>
              <Clock size={13} color={theme.amber} />
              <Text style={[styles.metaText, { color: theme.amber }]}>{t.slaTimeRemaining}</Text>
            </View>

            <View style={styles.metaItem}>
              <MessageSquare size={13} color={theme.textMuted} />
              <Text style={[styles.metaText, { color: theme.textMuted }]}>{t.commentsCount} notes</Text>
            </View>
          </View>

          <View style={styles.assigneeRow}>
            <Text style={[styles.assigneeLabel, { color: theme.textMuted }]}>Assigned Agent:</Text>
            <Text style={[styles.assigneeVal, { color: theme.textPrimary }]}>{t.assignedTo}</Text>
          </View>
        </Card>
      ))}

      {/* Raise Ticket Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Raise Internal HRMS Ticket</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            {submitted ? (
              <View style={styles.successState}>
                <CheckCircle2 size={48} color={theme.emerald} />
                <Text style={[styles.successTitle, { color: theme.textPrimary }]}>Ticket Created!</Text>
                <Text style={[styles.successDesc, { color: theme.textMuted }]}>Assigned to department queue.</Text>
              </View>
            ) : (
              <>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Target Department</Text>
                <View style={styles.deptRow}>
                  {['IT Support', 'HR & Payroll', 'Facilities'].map((dept) => (
                    <TouchableOpacity
                      key={dept}
                      style={[
                        styles.deptPill,
                        {
                          backgroundColor: department === dept ? theme.primary + '20' : theme.surfaceElevated,
                          borderColor: department === dept ? theme.primary : theme.border,
                        },
                      ]}
                      onPress={() => setDepartment(dept)}
                    >
                      <Text style={[styles.deptPillText, { color: department === dept ? theme.primary : theme.textMuted }]}>{dept}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Priority Level</Text>
                <View style={styles.deptRow}>
                  {['Low', 'Medium', 'High'].map((p) => (
                    <TouchableOpacity
                      key={p}
                      style={[
                        styles.deptPill,
                        {
                          backgroundColor: priority === p ? theme.roseBg : theme.surfaceElevated,
                          borderColor: priority === p ? theme.rose : theme.border,
                        },
                      ]}
                      onPress={() => setPriority(p)}
                    >
                      <Text style={[styles.deptPillText, { color: priority === p ? theme.rose : theme.textMuted }]}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Issue Subject</Text>
                <View style={[styles.inputBox, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                  <TextInput
                    style={[styles.inputText, { color: theme.textPrimary }]}
                    value={subject}
                    onChangeText={setSubject}
                    placeholder="Brief title of request..."
                    placeholderTextColor={theme.textMuted}
                  />
                </View>

                <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 10 }]}>Detailed Description</Text>
                <View style={[styles.textAreaBox, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                  <TextInput
                    style={[styles.inputText, { color: theme.textPrimary }]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Describe issue, workstation ID or steps..."
                    placeholderTextColor={theme.textMuted}
                    multiline
                    numberOfLines={3}
                  />
                </View>

                <Button
                  title="Submit Ticket to Queue"
                  onPress={handleCreateTicket}
                  loading={loading}
                  disabled={!subject || !description}
                  style={{ marginTop: 16 }}
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
  headerRow: {
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
  ticketCard: {
    marginBottom: 12,
    padding: 16,
  },
  ticketTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  ticketId: {
    ...typography.h4,
    fontWeight: '800',
  },
  badgeGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  ticketSubject: {
    ...typography.h4,
    marginBottom: 4,
  },
  ticketDesc: {
    ...typography.body,
    fontSize: 13,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    ...typography.micro,
  },
  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 8,
  },
  assigneeLabel: {
    ...typography.micro,
  },
  assigneeVal: {
    ...typography.caption,
    fontWeight: '700',
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
    marginBottom: 14,
  },
  modalTitle: {
    ...typography.h3,
  },
  inputLabel: {
    ...typography.caption,
    fontWeight: '600',
    marginBottom: 6,
  },
  deptRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  deptPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  deptPillText: {
    ...typography.micro,
    fontWeight: '700',
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
    height: 70,
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
