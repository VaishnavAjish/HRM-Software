import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ticket as TicketIcon, ChevronLeft, Plus, AlertCircle, Send, Lock, RotateCcw } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { typography, shadows } from '../theme';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Fab } from '../components/common/Fab';
import { LoadingView } from '../components/common/LoadingView';
import { EmptyState } from '../components/common/EmptyState';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const STATUS_VARIANT = {
  open: 'violet',
  assigned: 'amber',
  in_progress: 'amber',
  resolved: 'emerald',
  closed: 'default',
  reopened: 'rose',
};

const STATUS_TINT = {
  open: 'violet',
  assigned: 'amber',
  in_progress: 'amber',
  resolved: 'emerald',
  closed: 'textMuted',
  reopened: 'rose',
};

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

// Same rule WhatsApp uses in its chat list: time for today, a word for
// yesterday, a short date beyond that.
function listTime(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return chatTime(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
}

export function TicketScreen() {
  const [view, setView] = useState({ mode: 'list' });

  if (view.mode === 'create') {
    return <CreateTicket onDone={() => setView({ mode: 'list' })} onCancel={() => setView({ mode: 'list' })} />;
  }
  if (view.mode === 'detail') {
    return <TicketDetail id={view.id} onBack={() => setView({ mode: 'list' })} />;
  }
  return <TicketList onOpen={(id) => setView({ mode: 'detail', id })} onCreate={() => setView({ mode: 'create' })} />;
}

/* ------------------------------------------------------------------ list */

function TicketList({ onOpen, onCreate }) {
  const { theme } = useTheme();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const res = await api.getTickets();
      if (res?.status) {
        setTickets(res.data?.data || []);
      } else {
        setError(res?.message || 'Could not load tickets.');
      }
    } catch (e) {
      setError(e.message || 'Could not load tickets.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingView fullscreen label="Loading tickets…" />;

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.primary} />}
      >
        {error ? (
          <EmptyState icon={AlertCircle} title="Couldn't load tickets" message={error} tone="error" actionLabel="Retry" onAction={() => load()} />
        ) : tickets.length === 0 ? (
          <EmptyState icon={TicketIcon} title="No tickets yet" message="Tap the + button to raise your first ticket." />
        ) : (
          tickets.map((t, i) => {
            const tint = theme[STATUS_TINT[t.status] || 'primary'];
            return (
              <TouchableOpacity
                key={t.id}
                activeOpacity={0.7}
                onPress={() => onOpen(t.id)}
                style={[
                  styles.chatRow,
                  i !== tickets.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
                ]}
              >
                <View style={[styles.chatAvatar, { backgroundColor: tint + '1F' }]}>
                  <TicketIcon size={20} color={tint} />
                </View>

                <View style={styles.chatRowBody}>
                  <View style={styles.chatRowTop}>
                    <Text style={[styles.chatSubject, { color: theme.textPrimary }]} numberOfLines={1}>
                      {t.subject}
                    </Text>
                    <Text style={[styles.chatTime, { color: theme.textMuted }]}>{listTime(t.created_at)}</Text>
                  </View>
                  <View style={styles.chatRowBottom}>
                    <Text style={[styles.chatPreview, { color: theme.textMuted }]} numberOfLines={1}>
                      {t.ticket_number} · {t.category?.name || 'General'}
                    </Text>
                    <Badge label={label(t.status)} variant={STATUS_VARIANT[t.status] || 'default'} size="small" />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <Fab onPress={onCreate} accessibilityLabel="Raise a ticket" />
    </View>
  );
}

/* ---------------------------------------------------------------- create */

function CreateTicket({ onDone, onCancel }) {
  const { theme } = useTheme();
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState(null);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [loadingCategories, setLoadingCategories] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getTicketCategories();
        if (res?.status) {
          setCategories(res.data || []);
          if (res.data?.length) setCategoryId(res.data[0].id);
        }
      } catch (e) {
        // Non-fatal — the picker will just show empty.
      } finally {
        setLoadingCategories(false);
      }
    })();
  }, []);

  const canSubmit = categoryId && subject.trim() && description.trim() && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.createTicket({
        category_id: categoryId,
        subject: subject.trim(),
        description: description.trim(),
        priority,
      });
      if (res?.status) onDone();
      else setError(res?.message || 'Could not create ticket.');
    } catch (e) {
      setError(e.message || 'Could not create ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.formContent}>
        <TouchableOpacity onPress={onCancel} style={styles.backRow} activeOpacity={0.7}>
          <ChevronLeft size={18} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary }]}>Cancel</Text>
        </TouchableOpacity>

        <Card style={styles.formCard} elevated>
          <Text style={[styles.formTitle, { color: theme.textPrimary }]}>Raise a Ticket</Text>

          {error ? <Text style={[styles.errorText, { color: theme.rose }]}>{error}</Text> : null}

          <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Category</Text>
          {loadingCategories ? (
            <LoadingView label="Loading categories…" />
          ) : (
            <View style={styles.chipRow}>
              {categories.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.chip,
                    { borderColor: theme.border },
                    categoryId === c.id && { backgroundColor: theme.primary, borderColor: theme.primary },
                  ]}
                  onPress={() => setCategoryId(c.id)}
                >
                  <Text style={[styles.chipText, { color: categoryId === c.id ? '#FFFFFF' : theme.textPrimary }]}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Priority</Text>
          <View style={styles.chipRow}>
            {PRIORITIES.map((p) => (
              <TouchableOpacity
                key={p}
                style={[
                  styles.chip,
                  { borderColor: theme.border },
                  priority === p && { backgroundColor: theme.violet, borderColor: theme.violet },
                ]}
                onPress={() => setPriority(p)}
              >
                <Text style={[styles.chipText, { color: priority === p ? '#FFFFFF' : theme.textPrimary }]}>
                  {label(p)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Subject</Text>
          <TextInput
            style={[styles.input, { color: theme.textPrimary, backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
            value={subject}
            onChangeText={setSubject}
            placeholder="Brief summary of the issue"
            placeholderTextColor={theme.textMuted}
          />

          <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Description</Text>
          <TextInput
            style={[
              styles.input, styles.inputMultiline,
              { color: theme.textPrimary, backgroundColor: theme.surfaceElevated, borderColor: theme.border },
            ]}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe what's going on…"
            placeholderTextColor={theme.textMuted}
            multiline
          />

          <Button title="Submit Ticket" onPress={submit} loading={submitting} disabled={!canSubmit} variant="gradient" style={styles.submitBtn} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ------------------------------------------------------- detail (chat) */

function TicketDetail({ id, onBack }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [showReopen, setShowReopen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);
  const scrollRef = useRef(null);

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
      setError(e.message || 'Could not load this ticket.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const sendReply = async () => {
    if (!reply.trim() || sending) return;
    setSending(true);
    try {
      await api.replyTicket(id, reply.trim());
      setReply('');
      await load();
    } catch (e) {
      setError(e.message || 'Could not send reply.');
    } finally {
      setSending(false);
    }
  };

  const submitReopen = async () => {
    if (!reopenReason.trim()) return;
    setReopening(true);
    try {
      await api.reopenTicket(id, reopenReason.trim());
      setReopenReason('');
      setShowReopen(false);
      await load();
    } catch (e) {
      setError(e.message || 'Could not reopen this ticket.');
    } finally {
      setReopening(false);
    }
  };

  const tint = theme[STATUS_TINT[ticket?.status] || 'primary'];

  // The ticket description is the opening message of the thread. Tickets are
  // only ever the signed-in employee's own here, so it always aligns right.
  const thread = ticket
    ? [
        { id: 'opening', mine: true, message: ticket.description, created_at: ticket.created_at, sender: { name: 'You' } },
        ...(ticket.messages || []).map((m) => ({
          id: m.id,
          mine: m.sender?.id === user?.id,
          message: m.message,
          created_at: m.created_at,
          sender: m.sender,
        })),
      ]
    : [];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        {/* chat header */}
        <View style={[styles.chatHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={onBack} hitSlop={10} style={styles.chatBack}>
            <ChevronLeft size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <View style={[styles.chatHeaderAvatar, { backgroundColor: tint + '1F' }]}>
            <TicketIcon size={18} color={tint} />
          </View>
          <View style={styles.chatHeaderText}>
            <Text style={[styles.chatHeaderTitle, { color: theme.textPrimary }]} numberOfLines={1}>
              {ticket?.subject || 'Ticket'}
            </Text>
            <Text style={[styles.chatHeaderSub, { color: theme.textMuted }]} numberOfLines={1}>
              {ticket?.ticket_number}{ticket?.category?.name ? ` · ${ticket.category.name}` : ''}
            </Text>
          </View>
          {ticket ? <Badge label={label(ticket.status)} variant={STATUS_VARIANT[ticket.status] || 'default'} size="small" /> : null}
        </View>

        {loading ? (
          <LoadingView label="Loading ticket…" />
        ) : error && !ticket ? (
          <EmptyState icon={AlertCircle} title="Couldn't load ticket" message={error} tone="error" actionLabel="Retry" onAction={load} />
        ) : (
          <>
            <ScrollView
              ref={scrollRef}
              style={styles.chatBody}
              contentContainerStyle={styles.chatBodyContent}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            >
              {thread.map((m, i) => {
                const showDay = i === 0 || dayKey(m.created_at) !== dayKey(thread[i - 1].created_at);
                return (
                  <View key={m.id ?? i}>
                    {showDay ? (
                      <View style={styles.dayChipWrap}>
                        <View style={[styles.dayChip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                          <Text style={[styles.dayChipText, { color: theme.textMuted }]}>{dayLabel(m.created_at)}</Text>
                        </View>
                      </View>
                    ) : null}

                    <View style={[styles.bubbleRow, m.mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                      <View
                        style={[
                          styles.bubble,
                          m.mine
                            ? [styles.bubbleMine, { backgroundColor: theme.primary + '1F' }]
                            : [styles.bubbleTheirs, { backgroundColor: theme.surface, borderColor: theme.border }],
                        ]}
                      >
                        {!m.mine && m.sender?.name ? (
                          <Text style={[styles.bubbleSender, { color: theme.primary }]}>{m.sender.name}</Text>
                        ) : null}
                        <Text style={[styles.bubbleText, { color: theme.textPrimary }]}>{m.message}</Text>
                        <Text style={[styles.bubbleTime, { color: theme.textMuted }]}>{chatTime(m.created_at)}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            {/* composer */}
            {meta?.can_reply ? (
              <View style={[styles.composer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
                <View style={[styles.composerPill, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                  <TextInput
                    style={[styles.composerInput, { color: theme.textPrimary }]}
                    value={reply}
                    onChangeText={setReply}
                    placeholder="Message"
                    placeholderTextColor={theme.textMuted}
                    multiline
                  />
                </View>
                <TouchableOpacity onPress={sendReply} disabled={!reply.trim() || sending} activeOpacity={0.85}>
                  <LinearGradient
                    colors={theme.primaryGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.sendBtn, (!reply.trim() || sending) && { opacity: 0.45 }]}
                  >
                    <Send size={19} color="#FFFFFF" />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : meta?.can_reopen ? (
              <View style={[styles.composer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
                {!showReopen ? (
                  <TouchableOpacity
                    style={[styles.reopenBtn, { borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}
                    onPress={() => setShowReopen(true)}
                  >
                    <RotateCcw size={15} color={theme.primary} />
                    <Text style={[styles.reopenText, { color: theme.primary }]}>Reopen this ticket</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <View style={[styles.composerPill, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                      <TextInput
                        style={[styles.composerInput, { color: theme.textPrimary }]}
                        value={reopenReason}
                        onChangeText={setReopenReason}
                        placeholder="Why are you reopening this?"
                        placeholderTextColor={theme.textMuted}
                        multiline
                      />
                    </View>
                    <TouchableOpacity onPress={submitReopen} disabled={!reopenReason.trim() || reopening} activeOpacity={0.85}>
                      <LinearGradient
                        colors={theme.roseGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.sendBtn, (!reopenReason.trim() || reopening) && { opacity: 0.45 }]}
                      >
                        <Send size={19} color="#FFFFFF" />
                      </LinearGradient>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ) : (
              <View style={[styles.closedBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
                <Lock size={13} color={theme.textMuted} />
                <Text style={[styles.closedText, { color: theme.textMuted }]}>
                  This ticket is closed — no further replies can be sent.
                </Text>
              </View>
            )}
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// The floating tab bar is an absolutely positioned sibling of this screen, so
// anything anchored to the bottom has to clear it manually.
const TAB_BAR_CLEARANCE = 92;

const styles = StyleSheet.create({
  screen: { flex: 1 },

  /* list */
  listContent: { paddingTop: 6, paddingBottom: 170 },
  chatRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, gap: 12 },
  chatAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  chatRowBody: { flex: 1, minWidth: 0 },
  chatRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  chatSubject: { ...typography.h4, flexShrink: 1 },
  chatTime: { ...typography.micro },
  chatRowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 },
  chatPreview: { ...typography.caption, flexShrink: 1 },

  /* create form */
  formContent: { padding: 16, paddingBottom: 140 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  backText: { ...typography.body, fontWeight: '600' },
  formCard: { padding: 18 },
  formTitle: { ...typography.h3, marginBottom: 16 },
  fieldLabel: { ...typography.caption, marginBottom: 8, marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { ...typography.caption, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 8 },
  inputMultiline: { minHeight: 90, textAlignVertical: 'top' },
  submitBtn: { marginTop: 8 },
  errorText: { ...typography.caption, marginBottom: 12 },

  /* chat header */
  chatHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1,
  },
  chatBack: { padding: 2 },
  chatHeaderAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  chatHeaderText: { flex: 1, minWidth: 0 },
  chatHeaderTitle: { ...typography.h4 },
  chatHeaderSub: { ...typography.micro, marginTop: 2 },

  /* chat body */
  chatBody: { flex: 1 },
  chatBodyContent: { padding: 14, paddingBottom: 20 },
  dayChipWrap: { alignItems: 'center', marginVertical: 10 },
  dayChip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  dayChipText: { ...typography.micro, fontWeight: '700' },

  bubbleRow: { flexDirection: 'row', marginBottom: 8 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', paddingHorizontal: 11, paddingTop: 7, paddingBottom: 5, borderRadius: 16, ...shadows.card },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleTheirs: { borderBottomLeftRadius: 4, borderWidth: 1 },
  bubbleSender: { ...typography.micro, fontWeight: '800', marginBottom: 2 },
  bubbleText: { ...typography.body, lineHeight: 20 },
  bubbleTime: { ...typography.micro, alignSelf: 'flex-end', marginTop: 3 },

  /* composer */
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingTop: 10,
    paddingBottom: TAB_BAR_CLEARANCE,
    borderTopWidth: 1,
  },
  composerPill: {
    flex: 1, borderWidth: 1, borderRadius: 22,
    paddingHorizontal: 14, paddingVertical: 6, minHeight: 44, justifyContent: 'center',
  },
  composerInput: { fontSize: 14.5, maxHeight: 110, paddingTop: 4, paddingBottom: 4 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  reopenBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 22, borderWidth: 1,
  },
  reopenText: { ...typography.caption, fontWeight: '700' },
  closedBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: TAB_BAR_CLEARANCE, borderTopWidth: 1,
  },
  closedText: { ...typography.caption, flexShrink: 1 },
});
