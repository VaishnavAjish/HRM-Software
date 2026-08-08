import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { monthName, formatCurrency } from '../utils/format';
import { isCandidateApproved, isCandidateProcessed, typeLabel } from '../screens/agent/candidateHelpers';

const READ_KEY = 'hrms_notif_read_local';
const DISMISS_KEY = 'hrms_notif_dismissed_local';

// The backend only writes notification rows for the Tickets module, so approvals
// and payslips would never reach the bell on their own. Those two are derived
// here from data the app already loads — the feed then reads the same either way.
function agentItems(candidates) {
  const out = [];
  for (const c of candidates) {
    const name = c.name || 'A candidate';
    const when = c.updated_at || c.created_at;
    if (isCandidateProcessed(c)) {
      out.push({
        id: `agent-processed-${c.id}`,
        source: 'local',
        module: 'Recruitment',
        tone: 'emerald',
        title: 'Trial form processed',
        description: `${name}'s trial form has been processed into an appointment.`,
        timestamp: when,
      });
    } else if (isCandidateApproved(c)) {
      out.push({
        id: `agent-approved-${c.id}`,
        source: 'local',
        module: 'Recruitment',
        tone: 'emerald',
        title: `${typeLabel(c.type)} approved`,
        description: c.emp_code
          ? `${name} was approved — employee code ${c.emp_code}.`
          : `${name}'s ${typeLabel(c.type).toLowerCase()} was approved.`,
        timestamp: when,
      });
    }
  }
  return out;
}

function payslipItems(slips) {
  return slips.map((s) => ({
    id: `payslip-${s.id}`,
    source: 'local',
    module: 'Payroll',
    tone: 'emerald',
    title: 'Salary slip credited',
    description: `${monthName(s.month)} ${s.year} · ${formatCurrency(s.net_payable)} net payable.`,
    timestamp: s.created_at || new Date(Number(s.year) || 1970, (Number(s.month) || 1) - 1, 1).toISOString(),
  }));
}

const TICKET_TONE = { resolved: 'emerald', closed: 'default', reopened: 'rose', in_progress: 'amber', assigned: 'amber' };

function ticketItems(tickets) {
  return tickets.map((t) => ({
    id: `ticket-${t.id}-${t.status}`,
    source: 'local',
    module: 'Tickets',
    tone: TICKET_TONE[t.status] || 'violet',
    title: `Ticket ${String(t.status || '').replace(/_/g, ' ')}`,
    description: `${t.ticket_number || ''} — ${t.subject || ''}`.trim(),
    timestamp: t.updated_at || t.created_at,
  }));
}

function normaliseServer(rows) {
  return rows.map((n) => ({
    id: `srv-${n.id}`,
    serverId: n.id,
    source: 'server',
    module: n.module || 'General',
    tone: n.priority === 'High' || n.priority === 'Urgent' ? 'rose' : 'violet',
    title: n.title,
    description: n.description,
    timestamp: n.timestamp || n.created_at,
    isRead: Boolean(n.isRead),
  }));
}

export function useNotifications() {
  const { role, isAuthenticated } = useAuth();
  const isAgent = role === 'agent';
  const [server, setServer] = useState([]);
  const [derived, setDerived] = useState([]);
  const [readLocal, setReadLocal] = useState(() => new Set());
  const [dismissed, setDismissed] = useState(() => new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(READ_KEY), AsyncStorage.getItem(DISMISS_KEY)])
      .then(([r, d]) => {
        if (r) setReadLocal(new Set(JSON.parse(r)));
        if (d) setDismissed(new Set(JSON.parse(d)));
      })
      .catch(() => {});
  }, []);

  const persistRead = useCallback((next) => {
    setReadLocal(next);
    AsyncStorage.setItem(READ_KEY, JSON.stringify([...next])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);

    let serverRows = [];
    let serverOk = false;
    try {
      const res = await api.getNotifications({ limit: 50 });
      if (res?.status) {
        serverRows = normaliseServer(res.data || []);
        serverOk = true;
      }
    } catch (e) {
      // Feed unavailable (module not migrated) — derived items still populate.
    }
    setServer(serverRows);

    const local = [];
    try {
      if (isAgent) {
        const res = await api.getAgentCandidates();
        if (res?.status) local.push(...agentItems(res.data || []));
      } else {
        const slips = await api.getPayslips({ limit: 12 });
        if (slips?.status) local.push(...payslipItems(slips.data || []));
        // Only synthesise ticket rows when the server feed is unavailable,
        // otherwise every ticket would appear twice.
        if (!serverOk) {
          const tk = await api.getTickets();
          if (tk?.status) local.push(...ticketItems(tk.data?.data || []));
        }
      }
    } catch (e) {
      // Partial feed is better than an error screen.
    }
    setDerived(local);
    setLoading(false);
  }, [isAuthenticated, isAgent]);

  useEffect(() => { load(); }, [load]);

  const items = useMemo(() => {
    const merged = [
      ...server,
      ...derived
        .filter((d) => !dismissed.has(d.id))
        .map((d) => ({ ...d, isRead: readLocal.has(d.id) })),
    ];
    return merged.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  }, [server, derived, readLocal, dismissed]);

  const unread = useMemo(() => items.filter((i) => !i.isRead).length, [items]);

  const markRead = useCallback(async (item) => {
    if (item.isRead) return;
    if (item.source === 'server') {
      setServer((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
      api.markNotificationRead(item.serverId).catch(() => {});
    } else {
      persistRead(new Set([...readLocal, item.id]));
    }
  }, [readLocal, persistRead]);

  const markAllRead = useCallback(async () => {
    setServer((prev) => prev.map((n) => ({ ...n, isRead: true })));
    api.markAllNotificationsRead().catch(() => {});
    persistRead(new Set([...readLocal, ...derived.map((d) => d.id)]));
  }, [readLocal, derived, persistRead]);

  // Server rows are deleted outright. Derived rows have nothing to delete —
  // they're rebuilt from candidates/payslips on every refresh — so they're
  // remembered as dismissed instead, otherwise clearing would never stick.
  const clearAll = useCallback(async () => {
    const serverIds = server.map((n) => n.serverId).filter(Boolean);
    setServer([]);
    serverIds.forEach((id) => api.deleteNotification(id).catch(() => {}));

    const next = new Set([...dismissed, ...derived.map((d) => d.id)]);
    setDismissed(next);
    AsyncStorage.setItem(DISMISS_KEY, JSON.stringify([...next])).catch(() => {});
  }, [server, derived, dismissed]);

  return { items, unread, loading, reload: load, markRead, markAllRead, clearAll };
}
