import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Ticket as TicketIcon, ChevronLeft, AlertCircle, Send, Lock, RotateCcw,
  Check, CheckCheck, Tag, Flag, CalendarDays, UserCog,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { typography } from '../theme';
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

// Staff moving a ticket out of `open` means a human opened and acted on it —
// the nearest thing to a read receipt, since ticket_messages has no read_at.
const STAFF_ENGAGED = ['assigned', 'in_progress', 'resolved', 'closed'];

// `last_message` is served by the list endpoint; the description is the opening
// message, so it's the correct fallback rather than a placeholder label.
function lastMessageOf(t) {
  const msgs = t.messages || [];
  return t.last_message || (msgs.length ? msgs[msgs.length - 1] : null);
}

function previewText(t) {
  const text = lastMessageOf(t)?.message || t.description || '';
  return String(text).replace(/\s+/g, ' ').trim() || t.ticket_number;
}

export function TicketScreen({ onImmersiveChange }) {
  const [view, setView] = useState({ mode: 'list' });

  if (view.mode === 'create') {
    return <CreateTicket onDone={() => setView({ mode: 'list' })} onCancel={() => setView({ mode: 'list' })} />;
  }
  if (view.mode === 'detail') {
    return <TicketDetail id={view.id} onBack={() => setView({ mode: 'list' })} onImmersiveChange={onImmersiveChange} />;
  }
  return <TicketList onOpen={(id) => setView({ mode: 'detail', id })} onCreate={() => setView({ mode: 'create' })} />;
}

/* ------------------------------------------------------------------ list */

function TicketList({ onOpen, onCreate }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [inbox, setInbox] = useState([]);
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
    }

    // The ticket list carries no messages, so unread replies (and the text of
    // the newest one) come from the notification feed — the only place the
    // backend records that a reply happened.
    try {
      const n = await api.getNotifications({ module: 'Tickets', unread_only: true, limit: 100 });
      setInbox(n?.status ? (n.data || []) : []);
    } catch (e) {
      setInbox([]);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const inboxFor = (t) => inbox.filter((n) => (
    String(n.related_id) === String(t.id)
    || (t.ticket_number && String(n.title || '').includes(t.ticket_number))
  ));

  // Opening the conversation is the read receipt: clear its notifications.
  const openTicket = (t) => {
    const mine = inboxFor(t);
    mine.forEach((n) => api.markNotificationRead(n.id).catch(() => {}));
    setInbox((prev) => prev.filter((n) => !mine.some((m) => m.id === n.id)));
    onOpen(t.id);
  };

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
            const unread = inboxFor(t);
            const count = unread.length;
            const last = lastMessageOf(t);
            // No last_message means nothing has been replied to yet, so the
            // opening message — which is the employee's own — is the latest.
            const lastMine = last
              ? String(last.sender_id ?? last.sender?.id ?? '') === String(user?.id ?? '')
              : true;
            const lastSeen = lastMine && STAFF_ENGAGED.includes(t.status);
            const preview = previewText(t);
            const when = last?.created_at || t.created_at;
            return (
              <TouchableOpacity
                key={t.id}
                activeOpacity={0.7}
                onPress={() => openTicket(t)}
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
                    <Text style={[styles.chatTime, { color: count ? theme.primary : theme.textMuted }]}>
                      {listTime(when)}
                    </Text>
                  </View>
                  <View style={styles.chatRowBottom}>
                    <View style={styles.previewWrap}>
                      {lastMine ? (
                        lastSeen
                          ? <CheckCheck size={14} color={theme.violet} strokeWidth={2.6} />
                          : <Check size={14} color={theme.textMuted} strokeWidth={2.6} />
                      ) : null}
                      <Text
                        style={[
                          styles.chatPreview,
                          { color: count ? theme.textPrimary : theme.textMuted },
                          count > 0 && styles.chatPreviewUnread,
                        ]}
                        numberOfLines={1}
                      >
                        {preview}
                      </Text>
                    </View>
                    {count > 0 ? (
                      <View style={[styles.unreadPill, { backgroundColor: theme.primary }]}>
                        <Text style={styles.unreadPillText}>{count > 99 ? '99+' : count}</Text>
                      </View>
                    ) : (
                      <Badge label={label(t.status)} variant={STATUS_VARIANT[t.status] || 'default'} size="small" />
                    )}
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

function TicketDetail({ id, onBack, onImmersiveChange }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [showInfo, setShowInfo] = useState(false);
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

  // `silent` keeps the thread on screen while refreshing — flipping the shared
  // loading flag after a send is what made the chat blink back to a spinner.
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
      setError(e.message || 'Could not load this ticket.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Takes over the screen while open, and hands the chrome back on unmount.
  useEffect(() => {
    onImmersiveChange?.(true);
    return () => onImmersiveChange?.(false);
  }, [onImmersiveChange]);

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    setReply('');

    // Show the message immediately, then reconcile with the server copy.
    setTicket((prev) => (prev ? {
      ...prev,
      messages: [...(prev.messages || []), {
        id: `pending-${Date.now()}`,
        message: text,
        created_at: new Date().toISOString(),
        sender: { id: user?.id, name: user?.name },
      }],
    } : prev));

    try {
      await api.replyTicket(id, text);
      await load(true);
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

  // ticket_messages has no read_at column, so a true "seen at" is not available.
  // The closest honest signals are: someone replied after this message, or staff
  // picked the ticket up (assigning/working it means they opened and read it).
  const lastOtherIndex = thread.reduce((acc, m, i) => (m.mine ? acc : i), -1);
  const staffEngaged = STAFF_ENGAGED.includes(ticket?.status);

  if (showInfo && ticket) {
    return <TicketInfo ticket={ticket} theme={theme} onBack={() => setShowInfo(false)} />;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        {/* chat header */}
        <View style={[styles.chatHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={onBack} hitSlop={10} style={styles.chatBack}>
            <ChevronLeft size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.chatHeaderTap}
            activeOpacity={0.7}
            onPress={() => ticket && setShowInfo(true)}
          >
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
          </TouchableOpacity>
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
                const seen = m.mine && (i < lastOtherIndex || staffEngaged);
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
                            ? [styles.bubbleMine, { backgroundColor: MY_BUBBLE }]
                            : [styles.bubbleTheirs, { backgroundColor: theme.surface, borderColor: theme.border }],
                        ]}
                      >
                        {!m.mine && m.sender?.name ? (
                          <Text style={[styles.bubbleSender, { color: theme.primary }]}>{m.sender.name}</Text>
                        ) : null}
                        <Text style={[styles.bubbleText, { color: theme.textPrimary }]}>{m.message}</Text>
                        <View style={styles.bubbleMeta}>
                          <Text style={[styles.bubbleTime, { color: theme.textMuted }]}>{chatTime(m.created_at)}</Text>
                          {m.mine ? (
                            seen
                              ? <CheckCheck size={15} color={theme.violet} strokeWidth={2.6} />
                              : <Check size={15} color={theme.textMuted} strokeWidth={2.6} />
                          ) : null}
                        </View>
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

/* ------------------------------------------------------------ ticket info */

function TicketInfo({ ticket, theme, onBack }) {
  const tint = theme[STATUS_TINT[ticket.status] || 'primary'];
  const rows = [
    { icon: Tag, label: 'Category', value: ticket.category?.name || 'General' },
    { icon: Flag, label: 'Priority', value: label(ticket.priority) },
    { icon: CalendarDays, label: 'Raised on', value: `${dayLabel(ticket.created_at)} · ${chatTime(ticket.created_at)}` },
    { icon: UserCog, label: 'Assigned to', value: ticket.assignee?.name || 'Not assigned yet' },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={[styles.chatHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={onBack} hitSlop={10} style={styles.chatBack}>
          <ChevronLeft size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.chatHeaderTitle, { color: theme.textPrimary, flex: 1 }]}>Ticket info</Text>
      </View>

      <ScrollView contentContainerStyle={styles.infoContent}>
        <View style={styles.infoHero}>
          <View style={[styles.infoAvatar, { backgroundColor: tint + '1F' }]}>
            <TicketIcon size={38} color={tint} />
          </View>
          <Text style={[styles.infoSubject, { color: theme.textPrimary }]}>{ticket.subject}</Text>
          <Text style={[styles.infoNumber, { color: theme.textMuted }]}>{ticket.ticket_number}</Text>
          {/* Badge sets alignSelf:'flex-start' internally, so centring has to be re-stated here. */}
          <Badge
            label={label(ticket.status)}
            variant={STATUS_VARIANT[ticket.status] || 'default'}
            style={{ marginTop: 10, alignSelf: 'center' }}
          />
        </View>

        <Card style={styles.infoCard} elevated>
          {rows.map((r, i) => {
            const Icon = r.icon;
            return (
              <View
                key={r.label}
                style={[
                  styles.infoRow,
                  i !== rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
                ]}
              >
                <View style={[styles.infoRowIcon, { backgroundColor: theme.primary + '12' }]}>
                  <Icon size={16} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoRowLabel, { color: theme.textMuted }]}>{r.label}</Text>
                  <Text style={[styles.infoRowValue, { color: theme.textPrimary }]}>{r.value}</Text>
                </View>
              </View>
            );
          })}
        </Card>

        <Card style={styles.infoCard} elevated>
          <Text style={[styles.infoRowLabel, { color: theme.textMuted, marginBottom: 6 }]}>Description</Text>
          <Text style={[styles.infoDescription, { color: theme.textPrimary }]}>{ticket.description}</Text>
        </Card>
      </ScrollView>
    </View>
  );
}

// Own messages sit on a light violet plate — tinted enough to separate from the
// slate background without the washed-out look of an alpha overlay.
const MY_BUBBLE = '#E4DCFF';

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
  previewWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  chatPreview: { ...typography.caption, flexShrink: 1 },
  chatPreviewUnread: { fontWeight: '700' },
  unreadPill: {
    minWidth: 21, height: 21, borderRadius: 11, paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  unreadPillText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },

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
    // The app header is hidden in this view, so the chat bar owns the status-bar inset.
    paddingHorizontal: 12, paddingTop: 46, paddingBottom: 10, borderBottomWidth: 1,
  },
  chatBack: { padding: 2 },
  chatHeaderTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
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
  bubble: {
    maxWidth: '82%', paddingHorizontal: 11, paddingTop: 7, paddingBottom: 5, borderRadius: 16,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 2, elevation: 1,
  },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleTheirs: { borderBottomLeftRadius: 4, borderWidth: 1 },
  bubbleSender: { ...typography.micro, fontWeight: '800', marginBottom: 2 },
  bubbleText: { ...typography.body, lineHeight: 20 },
  bubbleMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: 3 },
  bubbleTime: { ...typography.micro },

  /* composer */
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingTop: 10,
    paddingBottom: 14,
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
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 22, borderTopWidth: 1,
  },
  closedText: { ...typography.caption, flexShrink: 1 },

  /* ticket info */
  infoContent: { padding: 16, paddingBottom: 40 },
  infoHero: { alignItems: 'center', paddingVertical: 18 },
  infoAvatar: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  infoSubject: { ...typography.h3, textAlign: 'center' },
  infoNumber: { ...typography.caption, marginTop: 4 },
  infoCard: { padding: 16, marginTop: 14 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  infoRowIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  infoRowLabel: { ...typography.caption },
  infoRowValue: { ...typography.body, fontWeight: '600', marginTop: 2 },
  infoDescription: { ...typography.body, lineHeight: 21 },
});
