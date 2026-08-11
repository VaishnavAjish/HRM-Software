import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Ticket as TicketIcon, ChevronLeft, AlertCircle, Send, Lock, RotateCcw,
  Check, CheckCheck, Tag, Flag, CalendarDays, UserCog, Plus, X, Camera as CameraIcon,
  CalendarCheck, Wallet, CalendarX2, Users, Laptop, HardDrive, Wifi, FileText, UserPlus,
  HelpCircle, ArrowDown, Minus, ArrowUp, AlertTriangle, File as FileIcon,
} from 'lucide-react-native';
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
import { pickImage } from '../utils/pickImage';
import { ChatWallpaper } from '../components/common/ChatWallpaper';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const PRIORITY_META = {
  low: { label: 'Low', icon: ArrowDown, tint: 'emerald' },
  medium: { label: 'Medium', icon: Minus, tint: 'amber' },
  high: { label: 'High', icon: ArrowUp, tint: 'rose' },
  urgent: { label: 'Urgent', icon: AlertTriangle, tint: 'rose' },
};

// Categories come from the server and can be renamed or added to, so this is
// a best-effort keyword match rather than a fixed lookup — anything unmatched
// still gets a sensible generic icon instead of breaking.
const CATEGORY_ICON_RULES = [
  [/attend/i, CalendarCheck],
  [/salary|payroll|pay\b/i, Wallet],
  [/leave/i, CalendarX2],
  [/\bhr\b/i, Users],
  [/it support|software/i, Laptop],
  [/hardware/i, HardDrive],
  [/network/i, Wifi],
  [/form ?16|document/i, FileText],
  [/appointment/i, UserPlus],
  [/other/i, HelpCircle],
];
function categoryIcon(name) {
  const hit = CATEGORY_ICON_RULES.find(([re]) => re.test(name || ''));
  return hit ? hit[1] : Tag;
}

const MAX_ATTACHMENTS = 5;

function humanFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

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
  const [images, setImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState('');
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

  const addImage = async () => {
    if (images.length >= MAX_ATTACHMENTS) return;
    const asset = await pickImage();
    if (asset) setImages((prev) => [...prev, asset]);
  };

  const removeImage = (index) => setImages((prev) => prev.filter((_, i) => i !== index));

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitStage('Creating ticket…');
    setError(null);
    try {
      const res = await api.createTicket({
        category_id: categoryId,
        subject: subject.trim(),
        description: description.trim(),
        priority,
      });
      if (!res?.status) {
        setError(res?.message || 'Could not create ticket.');
        return;
      }
      if (images.length) {
        setSubmitStage('Uploading attachments…');
        try {
          await api.uploadTicketAttachments(res.data.id, images);
        } catch (e) {
          // The ticket itself was created successfully — losing the attachment
          // upload shouldn't block that or look like the whole thing failed.
          setError(`Ticket ${res.data.ticket_number} was created, but the attachment(s) failed to upload: ${e.message}`);
          return;
        }
      }
      onDone();
    } catch (e) {
      setError(e.message || 'Could not create ticket.');
    } finally {
      setSubmitting(false);
      setSubmitStage('');
    }
  };

  const selectedCategory = categories.find((c) => c.id === categoryId);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={onCancel} style={styles.backRow} activeOpacity={0.7}>
          <ChevronLeft size={18} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary }]}>Cancel</Text>
        </TouchableOpacity>

        <Text style={[styles.formHeading, { color: theme.textPrimary }]}>Raise a Ticket</Text>
        <Text style={[styles.formSubheading, { color: theme.textMuted }]}>
          Tell us what's wrong — the more detail, the faster it gets sorted.
        </Text>

        {error ? (
          <Card style={[styles.errorCard, { backgroundColor: theme.roseBg, borderColor: theme.rose + '40' }]}>
            <Text style={{ color: theme.rose }}>{error}</Text>
          </Card>
        ) : null}

        <Card style={styles.sectionCard} elevated>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Category</Text>
          {loadingCategories ? (
            <LoadingView label="Loading categories…" />
          ) : (
            <View style={styles.categoryGrid}>
              {categories.map((c) => {
                const Icon = categoryIcon(c.name);
                const active = categoryId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.categoryTile,
                      { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary + '10' : theme.surfaceElevated },
                    ]}
                    onPress={() => setCategoryId(c.id)}
                    activeOpacity={0.75}
                  >
                    <Icon size={17} color={active ? theme.primary : theme.textMuted} />
                    <Text
                      style={[styles.categoryTileText, { color: active ? theme.primary : theme.textPrimary }]}
                      numberOfLines={1}
                    >
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </Card>

        <Card style={styles.sectionCard} elevated>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Priority</Text>
          <View style={styles.priorityRow}>
            {PRIORITIES.map((p) => {
              const meta = PRIORITY_META[p];
              const Icon = meta.icon;
              const active = priority === p;
              const tint = theme[meta.tint];
              return (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.priorityPill,
                    { borderColor: active ? tint : theme.border, backgroundColor: active ? tint + '14' : theme.surfaceElevated },
                  ]}
                  onPress={() => setPriority(p)}
                  activeOpacity={0.75}
                >
                  <Icon size={14} color={active ? tint : theme.textMuted} />
                  <Text style={[styles.priorityPillText, { color: active ? tint : theme.textPrimary }]}>{meta.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        <Card style={styles.sectionCard} elevated>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Details</Text>
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
        </Card>

        <Card style={styles.sectionCard} elevated>
          <View style={styles.attachHeader}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginBottom: 0 }]}>Attachments</Text>
            <Text style={[styles.attachCount, { color: theme.textMuted }]}>{images.length}/{MAX_ATTACHMENTS}</Text>
          </View>
          <Text style={[styles.attachHint, { color: theme.textMuted }]}>
            A screenshot or photo often explains the issue faster than words.
          </Text>
          <View style={styles.attachGrid}>
            {images.map((img, i) => (
              <View key={img.uri + i} style={styles.attachThumbWrap}>
                <Image source={{ uri: img.uri }} style={[styles.attachThumb, { borderColor: theme.border }]} />
                <TouchableOpacity style={[styles.attachRemove, { backgroundColor: theme.rose }]} onPress={() => removeImage(i)}>
                  <X size={12} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            ))}
            {images.length < MAX_ATTACHMENTS ? (
              <TouchableOpacity
                style={[styles.attachAdd, { borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}
                onPress={addImage}
                activeOpacity={0.75}
              >
                <CameraIcon size={18} color={theme.primary} />
                <Text style={[styles.attachAddText, { color: theme.primary }]}>Add</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </Card>

        <Button
          title={submitting ? submitStage || 'Submitting…' : 'Submit Ticket'}
          onPress={submit}
          loading={submitting}
          disabled={!canSubmit}
          variant="gradient"
          style={styles.submitBtn}
        />
        {selectedCategory ? (
          <Text style={[styles.submitHint, { color: theme.textMuted }]}>
            Goes to the {selectedCategory.name} queue
          </Text>
        ) : null}
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
  const [uploadingImage, setUploadingImage] = useState(false);
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
        uploader: { id: user?.id, name: user?.name },
        _localUri: asset.uri,
        _pending: true,
      }],
    } : prev));

    try {
      await api.uploadTicketAttachments(id, [asset]);
      await load(true);
    } catch (e) {
      setError(e.message || 'Could not upload the image.');
      setTicket((prev) => (prev ? { ...prev, attachments: (prev.attachments || []).filter((a) => a.id !== tempId) } : prev));
    } finally {
      setUploadingImage(false);
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
  const messageEntries = ticket
    ? [
        { kind: 'text', id: 'opening', mine: true, message: ticket.description, created_at: ticket.created_at, sender: { name: 'You' } },
        ...(ticket.messages || []).map((m) => ({
          kind: 'text',
          id: m.id,
          mine: m.sender?.id === user?.id,
          message: m.message,
          created_at: m.created_at,
          sender: m.sender,
        })),
      ]
    : [];

  // Attachments aren't tied to a specific message server-side (uploaded via a
  // separate endpoint), so they're merged into the same timeline as their own
  // entries, ordered by upload time, rather than nested inside a message.
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
          <ChatWallpaper style={styles.chatBody}>
            <ScrollView
              ref={scrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={styles.chatBodyContent}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            >
              {thread.map((m, i) => {
                const showDay = i === 0 || dayKey(m.created_at) !== dayKey(thread[i - 1].created_at);
                const seen = m.kind === 'text' && m.mine && (i < lastOtherIndex || staffEngaged);
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
                        <View style={[styles.dayChip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                          <Text style={[styles.dayChipText, { color: theme.textMuted }]}>{dayLabel(m.created_at)}</Text>
                        </View>
                      </View>
                    ) : null}

                    <View style={[styles.bubbleRow, m.mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                      {m.kind === 'attachment' ? (
                        isImage ? (
                          <View style={[styles.imageBubble, m.mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                            <Image source={imgSrc} style={styles.imageBubblePic} resizeMode="cover" />
                            {m.attachment._pending ? (
                              <View style={styles.imageBubbleOverlay}>
                                <Text style={styles.imageBubbleOverlayText}>Uploading…</Text>
                              </View>
                            ) : null}
                            <View style={styles.imageBubbleTimeWrap}>
                              <Text style={styles.imageBubbleTime}>{chatTime(m.created_at)}</Text>
                            </View>
                          </View>
                        ) : (
                          <View
                            style={[
                              styles.bubble, styles.fileBubble,
                              m.mine
                                ? [styles.bubbleMine, { backgroundColor: MY_BUBBLE }]
                                : [styles.bubbleTheirs, { backgroundColor: theme.surface, borderColor: theme.border }],
                            ]}
                          >
                            <View style={[styles.fileIconWrap, { backgroundColor: theme.primary + '15' }]}>
                              <FileIcon size={18} color={theme.primary} />
                            </View>
                            <View style={styles.fileMeta}>
                              <Text style={[styles.fileName, { color: theme.textPrimary }]} numberOfLines={1}>
                                {m.attachment.file_name || 'Attachment'}
                              </Text>
                              <Text style={[styles.fileSize, { color: theme.textMuted }]}>
                                {humanFileSize(m.attachment.file_size)} · {chatTime(m.created_at)}
                              </Text>
                            </View>
                          </View>
                        )
                      ) : (
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
                      )}
                    </View>
                  </View>
                );
            </ScrollView>
          </ChatWallpaper>

          {/* composer */}
          {meta?.can_reply ? (
            <View style={[styles.composer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
              <TouchableOpacity
                onPress={sendImage}
                disabled={uploadingImage}
                style={[styles.attachBtn, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }, uploadingImage && { opacity: 0.5 }]}
                activeOpacity={0.75}
              >
                  <Plus size={20} color={theme.primary} />
                </TouchableOpacity>
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
  formHeading: { ...typography.h2, marginBottom: 4 },
  formSubheading: { ...typography.body, marginBottom: 18 },
  errorCard: { padding: 12, marginBottom: 14 },
  sectionCard: { padding: 16, marginBottom: 12 },
  sectionTitle: { ...typography.h4, marginBottom: 12 },
  fieldLabel: { ...typography.caption, marginBottom: 8, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 8 },
  inputMultiline: { minHeight: 90, textAlignVertical: 'top' },
  submitBtn: { marginTop: 4 },
  submitHint: { ...typography.micro, textAlign: 'center', marginTop: 10 },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryTile: {
    width: '31%', flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5,
  },
  categoryTileText: { ...typography.micro, fontWeight: '700', flexShrink: 1 },

  priorityRow: { flexDirection: 'row', gap: 8 },
  priorityPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 10, borderRadius: 12, borderWidth: 1.5,
  },
  priorityPillText: { ...typography.caption, fontWeight: '700' },

  attachHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  attachCount: { ...typography.caption, fontWeight: '700' },
  attachHint: { ...typography.caption, marginBottom: 12 },
  attachGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  attachThumbWrap: { position: 'relative' },
  attachThumb: { width: 68, height: 68, borderRadius: 12, borderWidth: 1 },
  attachRemove: {
    position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  attachAdd: {
    width: 68, height: 68, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 3,
  },
  attachAddText: { ...typography.micro, fontWeight: '700' },

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

  /* attachment bubbles */
  imageBubble: {
    width: 190, height: 190, borderRadius: 16, overflow: 'hidden', position: 'relative',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 2, elevation: 1,
  },
  imageBubblePic: { width: '100%', height: '100%' },
  imageBubbleOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  imageBubbleOverlayText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  imageBubbleTimeWrap: { position: 'absolute', right: 6, bottom: 5, backgroundColor: 'rgba(15,23,42,0.55)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  imageBubbleTime: { color: '#FFFFFF', fontSize: 10, fontWeight: '600' },

  fileBubble: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, minWidth: 190 },
  fileIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fileMeta: { flexShrink: 1 },
  fileName: { ...typography.caption, fontWeight: '700' },
  fileSize: { ...typography.micro, marginTop: 2 },

  /* composer */
  attachBtn: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
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
