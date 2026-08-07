import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput } from 'react-native';
import { Ticket, CheckCircle2, AlertOctagon, MessageSquare, Clock, User, Send, X } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { typography, shadows } from '../../theme';
import { api } from '../../services/api';

export function AgentTicketsScreen() {
  const { theme } = useTheme();
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [agentNote, setAgentNote] = useState('');
  const [resolutionSuccess, setResolutionSuccess] = useState(false);

  useEffect(() => {
    loadQueue();
  }, []);

  const loadQueue = async () => {
    const data = await api.getAgentTickets();
    setTickets(data);
  };

  const handleOpenAction = (t) => {
    setSelectedTicket(t);
    setModalVisible(true);
  };

  const handleResolveTicket = (newStatus) => {
    setTickets((prev) =>
      prev.map((t) => (t.id === selectedTicket.id ? { ...t, status: newStatus } : t))
    );
    setResolutionSuccess(true);
    setTimeout(() => {
      setResolutionSuccess(false);
      setModalVisible(false);
      setAgentNote('');
    }, 1200);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>

      <Text style={[styles.pageTitle, { color: theme.textPrimary }]}>Agent Support Queue</Text>
      <Text style={[styles.pageSubtitle, { color: theme.textMuted }]}>Assigned HR, IT & Facilities Tickets</Text>

      {tickets.map((item) => (
        <Card key={item.id} style={styles.ticketCard} glass>
          <View style={styles.ticketTopRow}>
            <Text style={[styles.ticketId, { color: theme.violet }]}>{item.id}</Text>
            <View style={styles.badgeGroup}>
              <Badge label={item.priority} variant={item.priority} size="small" />
              <Badge label={item.status} variant={item.status} size="small" />
            </View>
          </View>

          <Text style={[styles.subjectText, { color: theme.textPrimary }]}>{item.subject}</Text>
          <Text style={[styles.descText, { color: theme.textSecondary }]}>{item.description}</Text>

          <View style={styles.employeeInfoBox}>
            <User size={14} color={theme.textMuted} />
            <Text style={[styles.employeeText, { color: theme.textMuted }]}>
              {item.employeeName} • {item.employeeDept}
            </Text>
          </View>

          <View style={styles.actionRow}>
            <View style={styles.slaGroup}>
              <Clock size={13} color={theme.rose} />
              <Text style={[styles.slaText, { color: theme.rose }]}>{item.slaTimeRemaining}</Text>
            </View>

            <Button
              title="Agent Actions"
              size="small"
              variant="accent"
              onPress={() => handleOpenAction(item)}
            />
          </View>
        </Card>
      ))}

      {/* Agent Action Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Action on {selectedTicket?.id}</Text>
                <Text style={[styles.modalSub, { color: theme.textMuted }]}>{selectedTicket?.subject}</Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            {resolutionSuccess ? (
              <View style={styles.successState}>
                <CheckCircle2 size={48} color={theme.emerald} />
                <Text style={[styles.successTitle, { color: theme.textPrimary }]}>Ticket Status Updated!</Text>
                <Text style={[styles.successDesc, { color: theme.textMuted }]}>Notification sent to {selectedTicket?.employeeName}.</Text>
              </View>
            ) : (
              <>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Add Agent Resolution Note</Text>
                <View style={[styles.textAreaBox, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                  <TextInput
                    style={[styles.inputText, { color: theme.textPrimary }]}
                    value={agentNote}
                    onChangeText={setAgentNote}
                    placeholder="Enter diagnostic notes or resolution details for employee..."
                    placeholderTextColor={theme.textMuted}
                    multiline
                    numberOfLines={3}
                  />
                </View>

                <View style={styles.statusButtonsRow}>
                  <Button
                    title="Mark Resolved"
                    variant="emerald"
                    size="small"
                    onPress={() => handleResolveTicket('Resolved')}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Escalate Ticket"
                    variant="rose"
                    size="small"
                    onPress={() => handleResolveTicket('Escalated')}
                    style={{ flex: 1 }}
                  />
                </View>
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
  subjectText: {
    ...typography.h4,
    marginBottom: 4,
  },
  descText: {
    ...typography.body,
    fontSize: 13,
    marginBottom: 10,
  },
  employeeInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  employeeText: {
    ...typography.caption,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 10,
  },
  slaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  slaText: {
    ...typography.caption,
    fontWeight: '700',
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
    marginBottom: 16,
  },
  inputText: {
    fontSize: 14,
  },
  statusButtonsRow: {
    flexDirection: 'row',
    gap: 10,
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
