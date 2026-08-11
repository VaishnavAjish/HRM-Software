import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ScrollView, RefreshControl, TouchableOpacity,
  ActivityIndicator, Modal, Alert, KeyboardAvoidingView, Platform, TextInput,
} from 'react-native';
import {
  Ticket as TicketIcon, AlertCircle, ChevronLeft, ChevronRight, UserCog, ArrowUpCircle, Send, X,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography, shadows } from '../../theme';
import { api } from '../../services/api';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { SearchField } from '../../components/common/SearchField';
import { SelectField } from '../../components/common/SelectField';
import { StatCard } from '../../components/common/StatCard';
import { LoadingView } from '../../components/common/LoadingView';
import { EmptyState } from '../../components/common/EmptyState';
import { timeAgo, formatDate } from '../../utils/format';

const STATUS_VARIANT = {
  open: 'violet', assigned: 'amber', in_progress: 'amber', waiting_employee: 'amber',
  pending_approval: 'amber', escalated: 'rose', resolved: 'emerald', closed: 'default', reopened: 'rose',
};
const PRIORITY_VARIANT = { low: 'emerald', medium: 'amber', high: 'rose', urgent: 'rose' };

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'open', label: 'Open' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting_employee', label: 'Waiting on Employee' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
  { value: 'reopened', label: 'Reopened' },
];
const PRIORITY_FILTER_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' },
];

function label(s) {
  return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function PickerModal({ visible, title, options, onSelect, onClose }) {
  const { theme } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[styles.sheet, { backgroundColor: theme.surfaceCard, borderColor: theme.border }, shadows.glass]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}><X size={20} color={theme.textMuted} /></TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 360 }}>
            {options.map((opt) => (
              <TouchableOpacity key={opt.value} style={styles.option} onPress={() => onSelect(opt.value)}>
                <Text style={[styles.optionText, { color: theme.textPrimary }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function TicketDetail({ id, onBack, onChanged }) {
  const { theme } = useTheme();
  const [ticket, setTicket] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [assignees, setAssignees] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getTicket(id);
      if (res?.status) {
        setTicket(res.data);
        setMeta(res.meta);
      } else {
        setError(res?.message || 'Could not load this ticket.');
      }
    } catch (e) {
      setError(e?.message || 'Could not load this ticket.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const sendReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const res = await api.replyTicket(id, reply.trim());
      if (res?.status) {
        setReply('');
        load();
      } else {
        Alert.alert('Could not send reply', res?.message || 'Please try again.');
      }
    } catch (e) {
      Alert.alert('Could not send reply', e?.message || 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  const openAssigneePicker = async () => {
    try {
      const res = await api.getTicketAssignees();
      if (res?.status) {
        setAssignees(res.data || []);
        setAssigneePickerOpen(true);
      }
    } catch (e) {
      Alert.alert('Could not load staff list', e?.message || 'Please try again.');
    }
  };

  const doAssign = async (assigneeId) => {
    setAssigneePickerOpen(false);
    setBusy(true);
    try {
      const res = await api.assignTicket(id, { assigned_to: assigneeId });
      if (res?.status) { load(); onChanged(); } else Alert.alert('Could not assign', res?.message || 'Please try again.');
    } catch (e) {
      Alert.alert('Could not assign', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = (status) => {
    Alert.alert(`Mark as "${label(status)}"?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          setBusy(true);
          try {
            const res = await api.updateTicketStatus(id, status);
            if (res?.status) { load(); onChanged(); } else Alert.alert('Could not update status', res?.message || 'Please try again.');
          } catch (e) {
            Alert.alert('Could not update status', e?.message || 'Please try again.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const doEscalate = () => {
    Alert.alert('Escalate this ticket?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Escalate',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const res = await api.escalateTicket(id);
            if (res?.status) { load(); onChanged(); } else Alert.alert('Could not escalate', res?.message || 'Please try again.');
          } catch (e) {
            Alert.alert('Could not escalate', e?.message || 'Please try again.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        <TouchableOpacity style={styles.backRow} onPress={onBack} activeOpacity={0.7}>
          <ChevronLeft size={18} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary }]}>Tickets</Text>
        </TouchableOpacity>

        {loading ? (
          <LoadingView label="Loading ticket…" />
        ) : error ? (
          <EmptyState icon={AlertCircle} title="Couldn't load ticket" message={error} tone="error" />
        ) : (
          <>
            <ScrollView contentContainerStyle={styles.detailContent}>
              <Card style={styles.infoCard} elevated>
                <View style={styles.infoTop}>
                  <Text style={[styles.ticketNumber, { color: theme.textMuted }]}>{ticket.ticket_number}</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Badge label={label(ticket.priority)} variant={PRIORITY_VARIANT[ticket.priority] || 'default'} size="small" />
                    <Badge label={label(ticket.status)} variant={STATUS_VARIANT[ticket.status] || 'default'} size="small" />
                  </View>
                </View>
                <Text style={[styles.subject, { color: theme.textPrimary }]}>{ticket.subject}</Text>
                <Text style={[styles.description, { color: theme.textMuted }]}>{ticket.description}</Text>
                <View style={styles.metaRow}>
                  <Text style={[styles.metaText, { color: theme.textMuted }]}>
                    Raised by {ticket.employee?.name || '—'} ({ticket.employee?.emp_code || '—'})
                  </Text>
                  <Text style={[styles.metaText, { color: theme.textMuted }]}>{formatDate(ticket.created_at)}</Text>
                </View>
                <Text style={[styles.metaText, { color: theme.textMuted }]}>
                  Category: {ticket.category?.name || '—'} · Assigned to: {ticket.assignee?.name || 'Unassigned'}
                </Text>
              </Card>

              <View style={styles.actionsRow}>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.primary + '12' }]} onPress={openAssigneePicker} disabled={busy}>
                  <UserCog size={15} color={theme.primary} />
                  <Text style={[styles.actionBtnText, { color: theme.primary }]}>Assign</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.roseBg }]} onPress={doEscalate} disabled={busy}>
                  <ArrowUpCircle size={15} color={theme.rose} />
                  <Text style={[styles.actionBtnText, { color: theme.rose }]}>Escalate</Text>
                </TouchableOpacity>
              </View>

              {meta?.next_statuses?.length ? (
                <View style={styles.statusRow}>
                  {meta.next_statuses.map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.statusChip, { borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}
                      onPress={() => changeStatus(s)}
                      disabled={busy}
                    >
                      <Text style={[styles.statusChipText, { color: theme.textPrimary }]}>Mark as {label(s)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Messages</Text>
              {(ticket.messages || []).map((m) => (
                <Card key={m.id} style={styles.messageCard} elevated>
                  <View style={styles.messageHeader}>
                    <Text style={[styles.messageSender, { color: theme.textPrimary }]}>{m.sender?.name || '—'}</Text>
                    <Text style={[styles.messageTime, { color: theme.textMuted }]}>{timeAgo(m.created_at)}</Text>
                  </View>
                  <Text style={[styles.messageText, { color: theme.textPrimary }]}>{m.message}</Text>
                </Card>
              ))}
            </ScrollView>

            {meta?.can_reply ? (
              <View style={[styles.composer, { borderTopColor: theme.border, backgroundColor: theme.surfaceCard }]}>
                <TextInput
                  style={[styles.composerInput, { color: theme.textPrimary, backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
                  value={reply}
                  onChangeText={setReply}
                  placeholder="Type a reply…"
                  placeholderTextColor={theme.textMuted}
                  multiline
                />
                <TouchableOpacity onPress={sendReply} disabled={sending || !reply.trim()} style={[styles.sendBtn, { backgroundColor: theme.primary }]}>
                  {sending ? <ActivityIndicator size="small" color="#FFF" /> : <Send size={16} color="#FFF" />}
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        )}
      </View>

      <PickerModal
        visible={assigneePickerOpen}
        title="Assign to"
        options={assignees.map((a) => ({ value: a.id, label: `${a.name} (${a.emp_code || a.role})` }))}
        onSelect={doAssign}
        onClose={() => setAssigneePickerOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

const PAGE_SIZE = 20;

export function AdminTicketsScreen() {
  const { theme } = useTheme();
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [tickets, setTickets] = useState([]);
  const [counts, setCounts] = useState({});
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
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
      if (status) params.status = status;
      if (priority) params.priority = priority;
      const res = await api.getAdminTickets(params);
      if (myRequest !== requestId.current) return;
      if (res?.status) {
        const list = res.data?.data || [];
        setTickets((prev) => (append ? [...prev, ...list] : list));
        setPage(res.data?.current_page || pageNum);
        setLastPage(res.data?.last_page || pageNum);
        setCounts(res.meta?.counts || {});
      } else {
        setError(res?.message || 'Could not load tickets.');
      }
    } catch (e) {
      if (myRequest === requestId.current) setError(e?.message || 'Could not load tickets.');
    } finally {
      if (myRequest === requestId.current) {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    }
  }, [search, status, priority]);

  useEffect(() => {
    const t = setTimeout(() => fetchPage(1), 350);
    return () => clearTimeout(t);
  }, [search, status, priority]);

  const loadMore = () => {
    if (loadingMore || loading || page >= lastPage) return;
    fetchPage(page + 1, { append: true });
  };

  const openCount = (counts.open || 0) + (counts.assigned || 0) + (counts.in_progress || 0);
  const escalatedCount = counts.escalated || 0;

  if (selectedId) {
    return (
      <TicketDetail
        id={selectedId}
        onBack={() => { setSelectedId(null); fetchPage(1); }}
        onChanged={() => {}}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.headerArea}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Tickets</Text>
        <View style={styles.statsRow}>
          <StatCard icon={TicketIcon} label="Active" value={openCount} tint="amber" />
          <StatCard icon={AlertCircle} label="Escalated" value={escalatedCount} tint="rose" />
        </View>
        <SearchField value={search} onChangeText={setSearch} placeholder="Search ticket #, subject, employee…" />
        <View style={styles.filterRow}>
          <View style={{ flex: 1 }}><SelectField value={status} onChange={setStatus} options={STATUS_FILTER_OPTIONS} searchable={false} /></View>
          <View style={{ flex: 1 }}><SelectField value={priority} onChange={setPriority} options={PRIORITY_FILTER_OPTIONS} searchable={false} /></View>
        </View>
      </View>

      {loading ? (
        <LoadingView label="Loading tickets…" />
      ) : error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load tickets" message={error} tone="error" actionLabel="Retry" onAction={() => fetchPage(1)} />
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchPage(1, { isRefresh: true })} tintColor={theme.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
          renderItem={({ item }) => (
            <TouchableOpacity activeOpacity={0.8} onPress={() => setSelectedId(item.id)}>
              <Card style={styles.row} elevated>
                <View style={styles.rowTop}>
                  <Text style={[styles.rowNumber, { color: theme.textMuted }]}>{item.ticket_number}</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Badge label={label(item.priority)} variant={PRIORITY_VARIANT[item.priority] || 'default'} size="small" />
                    <Badge label={label(item.status)} variant={STATUS_VARIANT[item.status] || 'default'} size="small" />
                  </View>
                </View>
                <Text style={[styles.rowSubject, { color: theme.textPrimary }]} numberOfLines={1}>{item.subject}</Text>
                <View style={styles.rowBottom}>
                  <Text style={[styles.rowMeta, { color: theme.textMuted }]} numberOfLines={1}>
                    {item.employee?.name || '—'} · {item.assignee?.name ? `Assigned to ${item.assignee.name}` : 'Unassigned'}
                  </Text>
                  <View style={styles.rowRight}>
                    <Text style={[styles.rowTime, { color: theme.textMuted }]}>{timeAgo(item.last_activity_at || item.created_at)}</Text>
                    <ChevronRight size={16} color={theme.textMuted} />
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<EmptyState icon={TicketIcon} title="No tickets found" message="Try a different search or filter." />}
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
  row: { marginBottom: 10, padding: 14 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  rowNumber: { ...typography.micro, fontWeight: '700' },
  rowSubject: { ...typography.body, fontWeight: '700', marginBottom: 6 },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowMeta: { ...typography.caption, flexShrink: 1, marginRight: 8 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowTime: { ...typography.micro },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 16, marginBottom: 16, marginLeft: 16 },
  backText: { ...typography.body, fontWeight: '600' },
  detailContent: { paddingHorizontal: 16, paddingBottom: 20 },
  infoCard: { marginBottom: 14, padding: 16 },
  infoTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  ticketNumber: { ...typography.caption, fontWeight: '700' },
  subject: { ...typography.h4, marginBottom: 6 },
  description: { ...typography.body, marginBottom: 10 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  metaText: { ...typography.caption },
  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  actionBtnText: { ...typography.caption, fontWeight: '700' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statusChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  statusChipText: { ...typography.caption, fontWeight: '600' },
  sectionTitle: { ...typography.h4, marginBottom: 10 },
  messageCard: { marginBottom: 8, padding: 12 },
  messageHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  messageSender: { ...typography.caption, fontWeight: '700' },
  messageTime: { ...typography.micro },
  messageText: { ...typography.body },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12, borderTopWidth: 1 },
  composerInput: { flex: 1, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, maxHeight: 100, fontSize: 14 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  sheet: { width: '85%', maxHeight: '70%', borderRadius: 20, borderWidth: 1, padding: 16 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sheetTitle: { ...typography.h4 },
  option: { paddingVertical: 12, paddingHorizontal: 8, borderRadius: 10 },
  optionText: { ...typography.body },
});
