import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ScrollView, RefreshControl, TouchableOpacity,
  ActivityIndicator, Modal, Alert, KeyboardAvoidingView, Platform, TextInput, Image,
} from 'react-native';
import {
  Ticket as TicketIcon, AlertCircle, ChevronLeft, ChevronRight, UserCog, ArrowUpCircle, Send, X,
  Check, CheckCheck, Camera as CameraIcon, Info, Clock, User, Tag, ShieldCheck, CornerDownRight,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography, shadows } from '../../theme';
import { api } from '../../services/api';
import { Card } from '../../components/common/Card';
import { Avatar } from '../../components/common/Avatar';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { SearchField } from '../../components/common/SearchField';
import { LoadingView } from '../../components/common/LoadingView';
import { EmptyState } from '../../components/common/EmptyState';
import { timeAgo, formatDate } from '../../utils/format';
import { pickImage } from '../../utils/pickImage';

const STATUS_VARIANT = {
  open: 'violet', assigned: 'amber', in_progress: 'amber', waiting_employee: 'amber',
  pending_approval: 'amber', escalated: 'rose', resolved: 'emerald', closed: 'default', reopened: 'rose',
};
const PRIORITY_VARIANT = { low: 'emerald', medium: 'amber', high: 'rose', urgent: 'rose' };

const STATUS_PILLS = [
  { value: '', label: 'All Statuses' },
  { value: 'open', label: 'Open' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

function label(s) {
  return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function chatTime(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function dayKey(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toDateString();
}

function dayLabel(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function PickerModal({ visible, title, options, onSelect, onClose }) {
  const { theme } = useTheme();
  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
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

/* ------------------------------------------------------- WhatsApp Chat View for Admin */
function AdminTicketDetail({ id, onBack, onChanged, onImmersiveChange }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [showInfo, setShowInfo] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [assignees, setAssignees] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const scrollRef = useRef(null);

  // Take over device screen when chat is open (removes floating bottom tab bar & top header)
  useEffect(() => {
    onImmersiveChange?.(true);
    return () => onImmersiveChange?.(false);
  }, [onImmersiveChange]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
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
      if (!silent) setError(e?.message || 'Could not load this ticket.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    setReply('');

    // Optimistic WhatsApp bubble update
    setTicket((prev) => (prev ? {
      ...prev,
      messages: [...(prev.messages || []), {
        id: `pending-${Date.now()}`,
        message: text,
        created_at: new Date().toISOString(),
        sender: { id: user?.id, name: user?.name || 'Admin' },
      }],
    } : prev));

    try {
      await api.replyTicket(id, text);
      await load(true);
      onChanged();
    } catch (e) {
      Alert.alert('Could not send reply', e?.message || 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  const sendImage = async () => {
    const asset = await pickImage();
    if (!asset) return;
    setUploadingImage(true);

    const tempId = `pending-att-${Date.now()}`;
    setTicket((prev) => (prev ? {
      ...prev,
      attachments: [...(prev.attachments || []), {
        id: tempId,
        mime_type: asset.mimeType || 'image/jpeg',
        file_name: asset.fileName,
        created_at: new Date().toISOString(),
        uploaded_by: user?.id,
        uploader: { id: user?.id, name: user?.name || 'Admin' },
        _localUri: asset.uri,
        _pending: true,
      }],
    } : prev));

    try {
      await api.uploadTicketAttachments(id, [asset]);
      await load(true);
      onChanged();
    } catch (e) {
      Alert.alert('Could not upload image', e?.message || 'Please try again.');
      setTicket((prev) => (prev ? { ...prev, attachments: (prev.attachments || []).filter((a) => a.id !== tempId) } : prev));
    } finally {
      setUploadingImage(false);
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

  const changeStatus = (newStatus) => {
    Alert.alert(`Mark as "${label(newStatus)}"?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          setBusy(true);
          try {
            const res = await api.updateTicketStatus(id, newStatus);
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

  // Merge messages & attachments into WhatsApp timeline
  const messageEntries = ticket
    ? [
        {
          kind: 'text',
          id: 'opening',
          mine: String(ticket.employee?.id ?? '') === String(user?.id ?? ''),
          message: ticket.description,
          created_at: ticket.created_at,
          sender: { name: ticket.employee?.name || 'Employee' },
        },
        ...(ticket.messages || []).map((m) => ({
          kind: 'text',
          id: m.id,
          mine: String(m.sender?.id ?? '') === String(user?.id ?? '') || m.sender?.role === 'admin',
          message: m.message,
          created_at: m.created_at,
          sender: m.sender,
        })),
      ]
    : [];

  const attachmentEntries = (ticket?.attachments || []).map((a) => ({
    kind: 'attachment',
    id: a.id,
    mine: a._pending || String(a.uploaded_by ?? a.uploader?.id ?? '') === String(user?.id ?? ''),
    created_at: a.created_at,
    attachment: a,
  }));

  const thread = [...messageEntries, ...attachmentEntries].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        {/* Clean WhatsApp Chat Header */}
        <View style={[styles.chatHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={onBack} hitSlop={10} style={styles.chatBack}>
            <ChevronLeft size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.chatHeaderTap}
            activeOpacity={0.7}
            onPress={() => ticket && setShowInfo(true)}
          >
            <Avatar name={ticket?.employee?.name || ticket?.subject || 'T'} size={38} />
            <View style={styles.chatHeaderText}>
              <Text style={[styles.chatHeaderTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                {ticket?.subject || 'Ticket'}
              </Text>
              <Text style={[styles.chatHeaderSub, { color: theme.textMuted }]} numberOfLines={1}>
                {ticket?.employee?.name ? `${ticket.employee.name} · ${ticket.ticket_number}` : ticket?.ticket_number}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => ticket && setShowInfo(true)} style={styles.infoTouchBtn} hitSlop={8}>
            <Info size={22} color={theme.primary} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <LoadingView label="Loading ticket timeline…" />
        ) : error && !ticket ? (
          <EmptyState icon={AlertCircle} title="Couldn't load ticket" message={error} tone="error" actionLabel="Retry" onAction={() => load()} />
        ) : (
          <>
            {/* WhatsApp Chat Body */}
            <ScrollView
              ref={scrollRef}
              style={styles.chatBody}
              contentContainerStyle={styles.chatBodyContent}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            >
              {thread.map((m, i) => {
                const showDay = i === 0 || dayKey(m.created_at) !== dayKey(thread[i - 1].created_at);
                const isImage = m.kind === 'attachment' && String(m.attachment.mime_type || '').startsWith('image/');
                const imgSrc = isImage
                  ? (m.attachment._pending
                      ? { uri: m.attachment._localUri }
                      : { uri: api.getTicketAttachmentUrl(id, m.attachment.id), headers: api.authHeaders() })
                  : null;

                return (
                  <View key={`${m.kind}-${m.id ?? i}`}>
                    {showDay ? (
                      <View style={styles.dayChipWrap}>
                        <View style={[styles.dayChip, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                          <Text style={[styles.dayChipText, { color: theme.textMuted }]}>{dayLabel(m.created_at)}</Text>
                        </View>
                      </View>
                    ) : null}

                    <View style={[styles.bubbleRow, m.mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                      {m.kind === 'attachment' ? (
                        isImage ? (
                          <View style={[styles.imageBubble, m.mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                            <Image source={imgSrc} style={styles.imageBubblePic} resizeMode="cover" />
                            <Text style={[styles.bubbleTime, m.mine ? styles.bubbleTimeMine : { color: theme.textMuted }]}>
                              {chatTime(m.created_at)}
                            </Text>
                          </View>
                        ) : (
                          <View style={[styles.bubble, m.mine ? styles.bubbleMine : styles.bubbleTheirs, { backgroundColor: m.mine ? theme.primary : theme.surfaceElevated }]}>
                            <Text style={[styles.bubbleSender, { color: m.mine ? '#E0E7FF' : theme.primary }]}>{m.attachment.file_name || 'Attachment'}</Text>
                            <Text style={[styles.bubbleTime, m.mine ? styles.bubbleTimeMine : { color: theme.textMuted }]}>{chatTime(m.created_at)}</Text>
                          </View>
                        )
                      ) : (
                        <View style={[styles.bubble, m.mine ? styles.bubbleMine : styles.bubbleTheirs, { backgroundColor: m.mine ? theme.primary : theme.surfaceElevated }]}>
                          {!m.mine ? (
                            <Text style={[styles.bubbleSender, { color: theme.primary }]}>{m.sender?.name || 'Employee'}</Text>
                          ) : null}
                          <Text style={[styles.bubbleText, { color: m.mine ? '#FFFFFF' : theme.textPrimary }]}>{m.message}</Text>
                          <View style={styles.bubbleFooter}>
                            <Text style={[styles.bubbleTime, m.mine ? styles.bubbleTimeMine : { color: theme.textMuted }]}>
                              {chatTime(m.created_at)}
                            </Text>
                            {m.mine ? <CheckCheck size={14} color="#A5B4FC" style={{ marginLeft: 4 }} /> : null}
                          </View>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            {/* WhatsApp Bottom Composer */}
            <View style={[styles.composer, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
              <TouchableOpacity onPress={sendImage} disabled={uploadingImage} style={styles.attachBtn} hitSlop={6}>
                {uploadingImage ? <ActivityIndicator size="small" color={theme.primary} /> : <CameraIcon size={22} color={theme.textMuted} />}
              </TouchableOpacity>
              <TextInput
                style={[styles.composerInput, { color: theme.textPrimary, backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
                value={reply}
                onChangeText={setReply}
                placeholder="Type a reply…"
                placeholderTextColor={theme.textMuted}
                multiline
              />
              <TouchableOpacity onPress={sendReply} disabled={sending || !reply.trim()} style={[styles.sendBtn, { backgroundColor: reply.trim() ? theme.primary : theme.border }]}>
                {sending ? <ActivityIndicator size="small" color="#FFF" /> : <Send size={16} color="#FFF" />}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Ticket Details & Action Sheet (statusBarTranslucent covers 100% of notch & screen) */}
      <Modal visible={showInfo} transparent statusBarTranslucent animationType="slide" onRequestClose={() => setShowInfo(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowInfo(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.modalSheet, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Ticket Details & Actions</Text>
              <TouchableOpacity onPress={() => setShowInfo(false)} hitSlop={8}><X size={20} color={theme.textMuted} /></TouchableOpacity>
            </View>
            {ticket ? (
              <ScrollView style={{ maxHeight: 460 }}>
                <Text style={[styles.infoNumber, { color: theme.textMuted }]}>{ticket.ticket_number}</Text>
                <Text style={[styles.infoSubject, { color: theme.textPrimary }]}>{ticket.subject}</Text>
                <Text style={[styles.infoDesc, { color: theme.textMuted }]}>{ticket.description}</Text>

                {/* Practical Admin Action Buttons */}
                <View style={styles.infoActionRow}>
                  <TouchableOpacity style={[styles.infoActionBtn, { backgroundColor: theme.primary + '15', borderColor: theme.primary + '40' }]} onPress={() => { setShowInfo(false); openAssigneePicker(); }} disabled={busy}>
                    <UserCog size={15} color={theme.primary} />
                    <Text style={[styles.infoActionBtnText, { color: theme.primary }]}>
                      {ticket?.assignee?.name ? `Assign (${ticket.assignee.name.split(' ')[0]})` : 'Assign Staff'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={[styles.infoActionBtn, { backgroundColor: theme.roseBg, borderColor: theme.rose + '40' }]} onPress={() => { setShowInfo(false); doEscalate(); }} disabled={busy}>
                    <ArrowUpCircle size={15} color={theme.rose} />
                    <Text style={[styles.infoActionBtnText, { color: theme.rose }]}>Escalate</Text>
                  </TouchableOpacity>
                </View>

                {meta?.next_statuses?.length ? (
                  <View style={styles.statusChipsGrid}>
                    {meta.next_statuses.map((s) => (
                      <TouchableOpacity key={s} style={[styles.statusChipBtn, { borderColor: theme.border, backgroundColor: theme.surfaceElevated }]} onPress={() => { setShowInfo(false); changeStatus(s); }} disabled={busy}>
                        <Text style={[styles.statusChipBtnText, { color: theme.textPrimary }]}>Mark as {label(s)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}

                <View style={styles.infoDivider} />

                <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: theme.textMuted }]}>Raised by:</Text><Text style={[styles.infoVal, { color: theme.textPrimary }]}>{ticket.employee?.name || '—'} (#{ticket.employee?.emp_code || '—'})</Text></View>
                <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: theme.textMuted }]}>Category:</Text><Text style={[styles.infoVal, { color: theme.textPrimary }]}>{ticket.category?.name || '—'}</Text></View>
                <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: theme.textMuted }]}>Priority:</Text><Badge label={label(ticket.priority)} variant={PRIORITY_VARIANT[ticket.priority] || 'default'} size="small" /></View>
                <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: theme.textMuted }]}>Status:</Text><Badge label={label(ticket.status)} variant={STATUS_VARIANT[ticket.status] || 'default'} size="small" /></View>
                <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: theme.textMuted }]}>Assigned to:</Text><Text style={[styles.infoVal, { color: theme.textPrimary }]}>{ticket.assignee?.name || 'Unassigned'}</Text></View>
                <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: theme.textMuted }]}>Created:</Text><Text style={[styles.infoVal, { color: theme.textPrimary }]}>{formatDate(ticket.created_at)}</Text></View>
              </ScrollView>
            ) : null}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <PickerModal
        visible={assigneePickerOpen}
        title="Assign to Staff"
        options={assignees.map((a) => ({ value: a.id, label: `${a.name} (${a.emp_code || a.role})` }))}
        onSelect={doAssign}
        onClose={() => setAssigneePickerOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

const PAGE_SIZE = 20;

export function AdminTicketsScreen({ onImmersiveChange }) {
  const { theme } = useTheme();
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [tickets, setTickets] = useState([]);
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

      if (res?.status !== false && res) {
        const list = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.data) ? res.data.data : [];
        setTickets((prev) => (append ? [...(Array.isArray(prev) ? prev : []), ...list] : list));
        setPage(res.pagination?.current_page || res.current_page || pageNum);
        setLastPage(res.pagination?.last_page || res.last_page || pageNum);
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

  if (selectedId) {
    return (
      <AdminTicketDetail
        id={selectedId}
        onBack={() => { setSelectedId(null); fetchPage(1); }}
        onChanged={() => fetchPage(1)}
        onImmersiveChange={onImmersiveChange}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* Header & Filter Area */}
      <View style={styles.headerArea}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Helpdesk Tickets</Text>
        <SearchField value={search} onChangeText={setSearch} placeholder="Search ticket #, subject, employee…" style={{ marginBottom: 10 }} />

        {/* Clean Horizontal Status Filter Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusPillsBar}>
          {STATUS_PILLS.map((pill) => {
            const isActive = status === pill.value;
            return (
              <TouchableOpacity
                key={pill.value}
                onPress={() => setStatus(pill.value)}
                style={[
                  styles.statusPill,
                  {
                    backgroundColor: isActive ? theme.primary : theme.surfaceElevated,
                    borderColor: isActive ? theme.primary : theme.border,
                  },
                ]}
                activeOpacity={0.8}
              >
                <Text style={[styles.statusPillText, { color: isActive ? '#FFFFFF' : theme.textMuted }]}>{pill.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Ticket List */}
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
            <TouchableOpacity activeOpacity={0.8} onPress={() => setSelectedId(item.id)} style={styles.cardWrap}>
              <Card style={styles.rowCard} elevated>
                <View style={styles.rowLeft}>
                  <Avatar name={item.employee?.name || item.subject} size={42} />
                  <View style={styles.rowMid}>
                    <View style={styles.rowTitleLine}>
                      <Text style={[styles.rowEmpName, { color: theme.textPrimary }]} numberOfLines={1}>
                        {item.employee?.name || 'Employee'}
                      </Text>
                      <Text style={[styles.rowTimeAgo, { color: theme.textMuted }]}>
                        {timeAgo(item.last_activity_at || item.created_at)}
                      </Text>
                    </View>

                    <Text style={[styles.rowSubjectText, { color: theme.textPrimary }]} numberOfLines={1}>
                      {item.subject}
                    </Text>

                    <View style={styles.rowMetaLine}>
                      <Text style={[styles.rowTicketNum, { color: theme.textMuted }]} numberOfLines={1}>
                        {item.ticket_number} · {item.assignee?.name ? `Assigned to ${item.assignee.name.split(' ')[0]}` : 'Unassigned'}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        <Badge label={label(item.priority)} variant={PRIORITY_VARIANT[item.priority] || 'default'} size="small" />
                        <Badge label={label(item.status)} variant={STATUS_VARIANT[item.status] || 'default'} size="small" />
                      </View>
                    </View>
                  </View>
                  <ChevronRight size={18} color={theme.textMuted} style={{ marginLeft: 4 }} />
                </View>
              </Card>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<EmptyState icon={TicketIcon} title="No tickets found" message="Try adjusting your status or search filters." />}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color={theme.primary} /> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerArea: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  title: { ...typography.h3, fontWeight: '800', marginBottom: 10 },
  statusPillsBar: { flexDirection: 'row', gap: 6, paddingBottom: 10 },
  statusPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  statusPillText: { ...typography.micro, fontWeight: '700' },
  listContent: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 110 },
  cardWrap: { marginBottom: 10 },
  rowCard: { padding: 12, borderRadius: 16 },
  rowLeft: { flexDirection: 'row', alignItems: 'center' },
  rowMid: { flex: 1, marginLeft: 12, marginRight: 6 },
  rowTitleLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowEmpName: { ...typography.body, fontWeight: '700', flex: 1, marginRight: 6 },
  rowTimeAgo: { ...typography.micro },
  rowSubjectText: { ...typography.caption, fontWeight: '600', marginTop: 2, marginBottom: 4 },
  rowMetaLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTicketNum: { ...typography.micro, flex: 1, marginRight: 6 },

  /* WhatsApp Chat Header */
  chatHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 14, borderBottomWidth: 1 },
  chatBack: { marginRight: 8 },
  chatHeaderTap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  chatHeaderText: { marginLeft: 10, flex: 1 },
  chatHeaderTitle: { ...typography.body, fontWeight: '700' },
  chatHeaderSub: { ...typography.micro },
  infoTouchBtn: { padding: 6 },

  /* WhatsApp Chat Body */
  chatBody: { flex: 1 },
  chatBodyContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 20 },
  dayChipWrap: { alignItems: 'center', marginVertical: 12 },
  dayChip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  dayChipText: { ...typography.micro, fontWeight: '600' },
  bubbleRow: { marginVertical: 4, flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 16 },
  bubbleMine: { borderBottomRightRadius: 2 },
  bubbleTheirs: { borderBottomLeftRadius: 2 },
  bubbleSender: { ...typography.micro, fontWeight: '700', marginBottom: 2 },
  bubbleText: { ...typography.body, fontSize: 14, lineHeight: 20 },
  bubbleFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  bubbleTime: { ...typography.micro, fontSize: 10 },
  bubbleTimeMine: { color: '#E0E7FF' },
  imageBubble: { maxWidth: '75%', padding: 4, borderRadius: 16, overflow: 'hidden' },
  imageBubblePic: { width: 200, height: 160, borderRadius: 12 },

  /* WhatsApp Bottom Composer */
  composer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1 },
  attachBtn: { padding: 6, marginRight: 6 },
  composerInput: { flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, maxHeight: 100, fontSize: 14, marginRight: 8 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  /* Modals */
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  sheet: { width: '85%', maxHeight: '70%', borderRadius: 20, borderWidth: 1, padding: 16 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sheetTitle: { ...typography.h4 },
  option: { paddingVertical: 12, paddingHorizontal: 8, borderRadius: 10 },
  optionText: { ...typography.body },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { ...typography.h3, fontWeight: '800' },
  infoNumber: { ...typography.caption, fontWeight: '700' },
  infoSubject: { ...typography.h3, fontWeight: '800', marginTop: 4 },
  infoDesc: { ...typography.body, marginTop: 6 },
  infoDivider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 14 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  infoLabel: { ...typography.caption },
  infoVal: { ...typography.body, fontWeight: '700' },

  infoActionRow: { flexDirection: 'row', gap: 10, marginTop: 14, marginBottom: 10 },
  infoActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  infoActionBtnText: { ...typography.caption, fontWeight: '700' },
  statusChipsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  statusChipBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  statusChipBtnText: { ...typography.micro, fontWeight: '600' },
});
