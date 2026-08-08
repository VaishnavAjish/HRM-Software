import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ticket as TicketIcon, ChevronLeft, ChevronRight, Plus, AlertCircle, Send } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import { typography } from '../theme';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { LoadingView } from '../components/common/LoadingView';
import { EmptyState } from '../components/common/EmptyState';
import { timeAgo } from '../utils/format';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const STATUS_VARIANT = {
  open: 'violet',
  assigned: 'amber',
  in_progress: 'amber',
  resolved: 'emerald',
  closed: 'default',
  reopened: 'rose',
};

function label(s) {
  return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingView fullscreen label="Loading tickets…" />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.primary} />}
    >
      <Button title="Raise a Ticket" onPress={onCreate} icon={Plus} variant="gradient" style={styles.raiseBtn} />

      {error ? (
        <EmptyState icon={AlertCircle} title="Couldn't load tickets" message={error} tone="error" actionLabel="Retry" onAction={() => load()} />
      ) : tickets.length === 0 ? (
        <EmptyState icon={TicketIcon} title="No tickets yet" message="Raise a ticket if you need help from support or HR." />
      ) : (
        tickets.map((t) => (
          <TouchableOpacity key={t.id} activeOpacity={0.8} onPress={() => onOpen(t.id)}>
            <Card style={styles.ticketCard} elevated>
              <View style={styles.ticketTopRow}>
                <Text style={[styles.ticketNumber, { color: theme.textMuted }]}>{t.ticket_number}</Text>
                <Badge label={label(t.status)} variant={STATUS_VARIANT[t.status] || 'default'} size="small" />
              </View>
              <Text style={[styles.ticketSubject, { color: theme.textPrimary }]} numberOfLines={1}>
                {t.subject}
              </Text>
              <View style={styles.ticketBottomRow}>
                <Text style={[styles.ticketMeta, { color: theme.textMuted }]}>
                  {t.category?.name || 'General'} · {timeAgo(t.created_at)}
                </Text>
                <ChevronRight size={16} color={theme.textMuted} />
              </View>
            </Card>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

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
      if (res?.status) {
        onDone();
      } else {
        setError(res?.message || 'Could not create ticket.');
      }
    } catch (e) {
      setError(e.message || 'Could not create ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
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
              styles.input,
              styles.inputMultiline,
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

function TicketDetail({ id, onBack }) {
  const { theme } = useTheme();
  const [ticket, setTicket] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [showReopen, setShowReopen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);

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

  useEffect(() => {
    load();
  }, [load]);

  const sendReply = async () => {
    if (!reply.trim()) return;
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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={onBack} style={styles.backRow} activeOpacity={0.7}>
          <ChevronLeft size={18} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary }]}>All tickets</Text>
        </TouchableOpacity>

        {loading ? (
          <LoadingView label="Loading ticket…" />
        ) : error && !ticket ? (
          <EmptyState icon={AlertCircle} title="Couldn't load ticket" message={error} tone="error" actionLabel="Retry" onAction={load} />
        ) : ticket ? (
          <>
            <Card style={styles.detailCard} elevated>
              <View style={styles.ticketTopRow}>
                <Text style={[styles.ticketNumber, { color: theme.textMuted }]}>{ticket.ticket_number}</Text>
                <Badge label={label(ticket.status)} variant={STATUS_VARIANT[ticket.status] || 'default'} size="small" />
              </View>
              <Text style={[styles.detailSubject, { color: theme.textPrimary }]}>{ticket.subject}</Text>
              <Text style={[styles.detailDescription, { color: theme.textSecondary }]}>{ticket.description}</Text>
              <View style={styles.chipRow}>
                <Badge label={label(ticket.priority)} variant={ticket.priority === 'urgent' || ticket.priority === 'high' ? 'rose' : 'default'} size="small" />
                {ticket.category?.name ? <Badge label={ticket.category.name} variant="cyan" size="small" /> : null}
              </View>
            </Card>

            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Conversation</Text>
            {(ticket.messages || []).length === 0 ? (
              <EmptyState icon={TicketIcon} title="No replies yet" message="Add a message below to start the conversation." />
            ) : (
              ticket.messages.map((m) => (
                <Card key={m.id} style={styles.messageCard} elevated>
                  <View style={styles.messageHeader}>
                    <Text style={[styles.messageSender, { color: theme.textPrimary }]}>{m.sender?.name || 'User'}</Text>
                    <Text style={[styles.messageTime, { color: theme.textMuted }]}>{timeAgo(m.created_at)}</Text>
                  </View>
                  <Text style={[styles.messageText, { color: theme.textSecondary }]}>{m.message}</Text>
                </Card>
              ))
            )}

            {meta?.can_reply && (
              <Card style={styles.replyCard} elevated>
                <TextInput
                  style={[styles.input, styles.inputMultiline, { color: theme.textPrimary, backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
                  value={reply}
                  onChangeText={setReply}
                  placeholder="Write a reply…"
                  placeholderTextColor={theme.textMuted}
                  multiline
                />
                <Button title="Send Reply" onPress={sendReply} loading={sending} icon={Send} variant="gradient" style={styles.submitBtn} />
              </Card>
            )}

            {meta?.can_reopen && (
              <Card style={styles.replyCard} elevated>
                {!showReopen ? (
                  <Button title="Reopen this ticket" onPress={() => setShowReopen(true)} variant="outline" />
                ) : (
                  <>
                    <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Why are you reopening this?</Text>
                    <TextInput
                      style={[styles.input, styles.inputMultiline, { color: theme.textPrimary, backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
                      value={reopenReason}
                      onChangeText={setReopenReason}
                      placeholder="Explain what's still wrong…"
                      placeholderTextColor={theme.textMuted}
                      multiline
                    />
                    <Button title="Confirm Reopen" onPress={submitReopen} loading={reopening} variant="rose" style={styles.submitBtn} />
                  </>
                )}
              </Card>
            )}
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 120 },
  raiseBtn: { marginBottom: 16 },
  ticketCard: { marginBottom: 10, padding: 16 },
  ticketTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  ticketNumber: { ...typography.micro },
  ticketSubject: { ...typography.h4, marginBottom: 8 },
  ticketBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ticketMeta: { ...typography.caption },
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
  detailCard: { padding: 18, marginBottom: 16 },
  detailSubject: { ...typography.h3, marginBottom: 8 },
  detailDescription: { ...typography.body, marginBottom: 12 },
  sectionTitle: { ...typography.h4, marginBottom: 12 },
  messageCard: { padding: 14, marginBottom: 10 },
  messageHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  messageSender: { ...typography.caption, fontWeight: '700' },
  messageTime: { ...typography.micro },
  messageText: { ...typography.body },
  replyCard: { padding: 16, marginTop: 4 },
});
