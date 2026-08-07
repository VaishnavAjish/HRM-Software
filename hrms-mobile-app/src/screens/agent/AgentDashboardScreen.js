import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { ShieldCheck, Ticket, AlertTriangle, CheckCircle2, Clock, MapPin, TrendingUp, Users } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { typography, shadows } from '../../theme';
import { api } from '../../services/api';

export function AgentDashboardScreen({ onNavigateTab }) {
  const { theme } = useTheme();
  const [agentTickets, setAgentTickets] = useState([]);
  const [fieldTasks, setFieldTasks] = useState([]);

  useEffect(() => {
    loadAgentData();
  }, []);

  const loadAgentData = async () => {
    const t = await api.getAgentTickets();
    const f = await api.getFieldTasks();
    setAgentTickets(t);
    setFieldTasks(f);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>

      {/* Agent Banner Card */}
      <Card style={styles.bannerCard} glass>
        <View style={styles.bannerRow}>
          <View style={[styles.bannerIconBadge, { backgroundColor: theme.violetBg }]}>
            <ShieldCheck size={28} color={theme.violet} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.bannerTitle, { color: theme.textPrimary }]}>Agent Support Command Desk</Text>
            <Text style={[styles.bannerSub, { color: theme.textMuted }]}>3 Assigned Tickets • 1 Field Visit Pending</Text>
          </View>
        </View>
      </Card>

      {/* SLA & Performance Metrics Grid */}
      <View style={styles.metricsGrid}>
        <View style={[styles.metricBox, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
          <View style={[styles.metricIcon, { backgroundColor: theme.roseBg }]}>
            <AlertTriangle size={16} color={theme.rose} />
          </View>
          <Text style={[styles.metricVal, { color: theme.textPrimary }]}>1 Urgent</Text>
          <Text style={[styles.metricLabel, { color: theme.textMuted }]}>SLA Warning</Text>
        </View>

        <View style={[styles.metricBox, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
          <View style={[styles.metricIcon, { backgroundColor: theme.emeraldBg }]}>
            <CheckCircle2 size={16} color={theme.emerald} />
          </View>
          <Text style={[styles.metricVal, { color: theme.textPrimary }]}>98.2%</Text>
          <Text style={[styles.metricLabel, { color: theme.textMuted }]}>SLA Met Today</Text>
        </View>

        <View style={[styles.metricBox, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
          <View style={[styles.metricIcon, { backgroundColor: theme.cyanBg }]}>
            <Clock size={16} color={theme.cyan} />
          </View>
          <Text style={[styles.metricVal, { color: theme.textPrimary }]}>14 mins</Text>
          <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Avg Response</Text>
        </View>
      </View>

      {/* Urgent SLA Ticket Preview */}
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginBottom: 0 }]}>High Priority Assigned Tickets</Text>
        <TouchableOpacity onPress={() => onNavigateTab('agent-tickets')}>
          <Text style={[styles.viewAllText, { color: theme.primary }]}>View Queue</Text>
        </TouchableOpacity>
      </View>

      {agentTickets.slice(0, 2).map((item) => (
        <Card key={item.id} style={styles.ticketCard} glass>
          <View style={styles.ticketTopRow}>
            <Text style={[styles.ticketId, { color: theme.violet }]}>{item.id}</Text>
            <Badge label={item.priority} variant={item.priority} size="small" />
          </View>

          <Text style={[styles.subjectText, { color: theme.textPrimary }]}>{item.subject}</Text>
          <Text style={[styles.empNameText, { color: theme.textMuted }]}>Raised by: {item.employeeName} ({item.employeeDept})</Text>

          <View style={styles.slaFooter}>
            <View style={styles.slaBadge}>
              <Clock size={12} color={theme.rose} />
              <Text style={[styles.slaText, { color: theme.rose }]}>{item.slaTimeRemaining}</Text>
            </View>
            <Button
              title="Resolve Ticket"
              size="small"
              variant="accent"
              onPress={() => onNavigateTab('agent-tickets')}
            />
          </View>
        </Card>
      ))}

      {/* Field Visit Shortcut Widget */}
      <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginTop: 18 }]}>Today's Assigned Field Visit</Text>
      {fieldTasks.slice(0, 1).map((task) => (
        <Card key={task.id} style={styles.fieldTaskCard} glass>
          <View style={styles.fieldHeader}>
            <MapPin size={18} color={theme.emerald} />
            <Text style={[styles.fieldTitle, { color: theme.textPrimary }]}>{task.title}</Text>
          </View>

          <Text style={[styles.clientText, { color: theme.textSecondary }]}>{task.client} • {task.address}</Text>
          <Text style={[styles.instructText, { color: theme.textMuted }]}>"{task.instructions}"</Text>

          <Button
            title="Start Onsite GPS Inspection"
            variant="emerald"
            size="small"
            onPress={() => onNavigateTab('field-tasks')}
            style={{ marginTop: 12 }}
          />
        </Card>
      ))}

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
  bannerCard: {
    marginBottom: 16,
    padding: 16,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: {
    ...typography.h3,
  },
  bannerSub: {
    ...typography.caption,
    marginTop: 2,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  metricBox: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  metricIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  metricVal: {
    ...typography.h4,
    fontWeight: '800',
  },
  metricLabel: {
    ...typography.micro,
    marginTop: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    ...typography.h3,
  },
  viewAllText: {
    ...typography.caption,
    fontWeight: '700',
  },
  ticketCard: {
    marginBottom: 12,
    padding: 16,
  },
  ticketTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  ticketId: {
    ...typography.h4,
    fontWeight: '800',
  },
  subjectText: {
    ...typography.h4,
    marginBottom: 4,
  },
  empNameText: {
    ...typography.caption,
    marginBottom: 12,
  },
  slaFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 10,
  },
  slaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  slaText: {
    ...typography.caption,
    fontWeight: '700',
  },
  fieldTaskCard: {
    padding: 16,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  fieldTitle: {
    ...typography.h4,
  },
  clientText: {
    ...typography.caption,
    fontWeight: '600',
    marginBottom: 4,
  },
  instructText: {
    ...typography.caption,
    fontStyle: 'italic',
  },
});
