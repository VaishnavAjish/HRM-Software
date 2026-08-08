import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  X, Send, Clock, MessageSquare, History, ShieldAlert, Loader2, Lock,
  User as UserIcon, Building2, Tag, AlertTriangle, Copy, Check,
  UserCheck, Briefcase, Calendar, CheckCircle2, Ticket as TicketIcon, ChevronDown,
} from "lucide-react";
import {
  statusMeta, priorityMeta, slaMeta, slaLabel,
  formatDateTime, formatDateTimeShort, initialsOf, avatarTone,
} from "./ticketMeta";
import { ticketApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";

/**
 * Staff ticket inspector.
 *
 * Layout notes, because the previous version had two problems that made it hard
 * to actually work a ticket in:
 *
 *  1. Eight metadata cards in a four-column grid inside a 672px drawer left
 *     about ninety pixels for each value, and every one of them was `truncate`d.
 *     Names read "Dhirubhai A…", departments "Polish-11 (M…", and all three
 *     timestamps collapsed to "08 Aug 202…" — the clipped part being the only
 *     part worth reading. The drawer is wider now, values wrap to two lines
 *     instead of clipping, and dates use a short format with the full value on
 *     hover.
 *
 *  2. Six equally loud "Mark …" buttons plus a red Escalate gave seven
 *     competing calls to action with no hierarchy. There is now one suggested
 *     next step as the primary button, the remaining transitions behind a single
 *     status menu, and Escalate kept separate because it does something else
 *     (it raises the escalation level and notifies, rather than only setting a
 *     status) — which is also why "Escalated" no longer appears in the menu.
 */

/** Which transition to surface as the primary button, given where we are. */
function primaryTransition(status, nextStatuses = []) {
  const preferred =
    status === "resolved" ? ["closed"]
      : status === "in_progress" ? ["resolved"]
        : ["in_progress", "assigned", "resolved"];

  return preferred.find((candidate) => nextStatuses.includes(candidate)) ?? null;
}

export default function SuperAdminTicketDrawer({ ticketId, onClose, onRefresh }) {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;

  const [ticket, setTicket] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("conversation");
  const [replyText, setReplyText] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busy, setBusy] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [copied, setCopied] = useState(false);

  const threadEndRef = useRef(null);

  const requestTicket = async () => {
    try {
      const res = await ticketApi.getTicket(ticketId, accessToken, tokenType);
      if (res?.status) {
        setTicket(res.data);
        setMeta(res.meta || null);
      }
    } finally {
      setLoading(false);
    }
  };

  const load = () =>
    requestTicket().catch((err) => toast.error(err.message || "Failed to load ticket"));

  const [seen, setSeen] = useState(ticketId);
  if (seen !== ticketId) {
    setSeen(ticketId);
    setLoading(true);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  useEffect(() => {
    if (!meta?.is_staff) return undefined;

    let cancelled = false;
    ticketApi
      .getAssignees(accessToken, tokenType)
      .then((res) => { if (!cancelled && res?.status) setAssignees(res.data || []); })
      .catch(() => { /* the assign control stays empty */ });

    return () => { cancelled = true; };
  }, [meta?.is_staff, accessToken, tokenType]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [ticket?.messages?.length, activeTab]);

  // Escape closes, matching every other overlay in the app.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const refresh = async () => {
    await load();
    onRefresh?.();
  };

  const copyTicketNumber = () => {
    if (!ticket?.ticket_number) return;
    navigator.clipboard.writeText(ticket.ticket_number);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    setSubmitting(true);
    try {
      const res = await ticketApi.reply(
        ticketId,
        { message: replyText.trim(), is_internal: isInternal },
        accessToken,
        tokenType,
      );
      if (res?.status) {
        setReplyText("");
        setIsInternal(false);
        await refresh();
      } else {
        toast.error(res?.message || "Failed to send reply");
      }
    } catch (err) {
      toast.error(err.message || "Failed to send reply");
    } finally {
      setSubmitting(false);
    }
  };

  const changeStatus = async (newStatus) => {
    if (!newStatus) return;
    setBusy(newStatus);
    try {
      const res = await ticketApi.updateStatus(ticketId, { status: newStatus }, accessToken, tokenType);
      res?.status ? toast.success(res.message || "Status updated") : toast.error(res?.message || "Failed");
      if (res?.status) await refresh();
    } catch (err) {
      toast.error(err.message || "Failed to update status");
    } finally {
      setBusy(null);
    }
  };

  const assignTo = async (assignedTo) => {
    if (!assignedTo) return;
    setBusy("assign");
    try {
      const res = await ticketApi.assign(ticketId, { assigned_to: Number(assignedTo) }, accessToken, tokenType);
      res?.status ? toast.success("Ticket assigned") : toast.error(res?.message || "Failed to assign");
      if (res?.status) await refresh();
    } catch (err) {
      toast.error(err.message || "Failed to assign");
    } finally {
      setBusy(null);
    }
  };

  const escalate = async () => {
    setBusy("escalate");
    try {
      const res = await ticketApi.escalate(ticketId, {}, accessToken, tokenType);
      res?.status ? toast.success(res.message || "Escalated") : toast.error(res?.message || "Failed to escalate");
      if (res?.status) await refresh();
    } catch (err) {
      toast.error(err.message || "Failed to escalate");
    } finally {
      setBusy(null);
    }
  };

  if (!ticketId) return null;

  const s = statusMeta(ticket?.status);
  const p = priorityMeta(ticket?.priority);
  const sla = slaMeta(ticket?.sla_status);
  const messages = ticket?.messages || [];
  const logs = ticket?.activity_logs || [];

  const nextStatuses = meta?.next_statuses || [];
  const primary = primaryTransition(ticket?.status, nextStatuses);
  // Escalation has its own button; leaving it here too invited picking the one
  // that only changes the label.
  const secondary = nextStatuses.filter((n) => n !== primary && n !== "escalated");
  const canEscalate = ticket && !["resolved", "closed", "escalated"].includes(ticket.status);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm">
      <button type="button" aria-label="Close" className="flex-1 cursor-default" onClick={onClose} />

      <div className="flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl dark:bg-[#0b0f1a]">
        {/* ── Header ── */}
        <div className="shrink-0 border-b border-gray-100 bg-gray-50/60 px-6 py-4 dark:border-white/10 dark:bg-white/[0.02]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {loading ? (
                <div className="space-y-2">
                  <div className="h-4 w-40 animate-pulse rounded-md bg-gray-200 dark:bg-gray-700" />
                  <div className="h-6 w-3/4 animate-pulse rounded-md bg-gray-200 dark:bg-gray-700" />
                </div>
              ) : ticket ? (
                <>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={copyTicketNumber}
                      title="Copy ticket number"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50/80 px-2.5 py-0.5 font-mono text-xs font-bold text-brand-700 transition hover:bg-brand-100 dark:border-brand-900/50 dark:bg-brand-950/50 dark:text-brand-300 dark:hover:bg-brand-900/50"
                    >
                      {ticket.ticket_number}
                      {copied
                        ? <Check size={12} className="text-emerald-600" />
                        : <Copy size={12} className="opacity-60" />}
                    </button>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${s.badgeBg}`}>{s.label}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${p.colorCls}`}>{p.label}</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${sla.cls}`}
                      title={ticket.sla_due_at ? `SLA due ${formatDateTime(ticket.sla_due_at)}` : "No SLA target set"}
                    >
                      <Clock size={10} /> {slaLabel(ticket)}
                    </span>
                    {ticket.escalation_level > 0 && (
                      <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                        Escalation L{ticket.escalation_level}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-2 break-words text-lg font-extrabold leading-snug text-gray-900 dark:text-white">
                    {ticket.subject}
                  </h2>
                </>
              ) : (
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Ticket unavailable</h2>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="animate-spin text-brand-500" size={24} />
          </div>
        ) : !ticket ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-gray-400">
            <ShieldAlert size={34} />
            <p className="text-sm font-medium">This ticket could not be loaded, or is outside your access scope.</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {ticket.is_overdue && (
                <div className="mb-5 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/90 p-3.5 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">
                    <AlertTriangle size={15} />
                  </div>
                  <div>
                    <p className="font-bold">SLA target breached</p>
                    <p className="text-[11px] opacity-90">
                      Past its resolution target and still unresolved
                      {ticket.sla_due_at ? ` — due ${formatDateTime(ticket.sla_due_at)}.` : "."}
                    </p>
                  </div>
                </div>
              )}

              {/* Three columns at this width leaves room for values to breathe. */}
              <div className="mb-5 grid grid-cols-2 gap-2.5 lg:grid-cols-3">
                <DetailCard
                  icon={UserIcon}
                  label="Raised By"
                  value={ticket.employee?.name}
                  sub={ticket.employee?.emp_code}
                  tone="bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400"
                />
                <DetailCard
                  icon={UserCheck}
                  label="Assigned To"
                  value={ticket.assignee?.name}
                  placeholder="Unassigned"
                  sub={ticket.assignee?.emp_code}
                  tone="bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400"
                />
                <DetailCard
                  icon={Tag}
                  label="Category"
                  value={ticket.category?.name}
                  tone="bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400"
                />
                <DetailCard
                  icon={Briefcase}
                  label="Department"
                  value={ticket.department}
                  tone="bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
                />
                <DetailCard
                  icon={Building2}
                  label="Company / Branch"
                  value={ticket.company_code}
                  sub={ticket.unit}
                  tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
                />
                <DetailCard
                  icon={Calendar}
                  label="Created"
                  value={formatDateTimeShort(ticket.created_at)}
                  title={formatDateTime(ticket.created_at)}
                  tone="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                />
                <DetailCard
                  icon={Clock}
                  label="SLA Due"
                  value={formatDateTimeShort(ticket.sla_due_at)}
                  title={formatDateTime(ticket.sla_due_at)}
                  tone="bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400"
                />
                <DetailCard
                  icon={CheckCircle2}
                  label="First Response"
                  value={formatDateTimeShort(ticket.first_response_at)}
                  placeholder="Not yet"
                  title={formatDateTime(ticket.first_response_at)}
                  tone="bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400"
                />
                <DetailCard
                  icon={History}
                  label="Last Activity"
                  value={formatDateTimeShort(ticket.last_activity_at)}
                  title={formatDateTime(ticket.last_activity_at)}
                  tone="bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400"
                />
              </div>

              <section className="mb-6 rounded-2xl border border-gray-100 bg-gray-50/60 p-4 dark:border-white/10 dark:bg-white/[0.02]">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <TicketIcon size={14} className="text-brand-500" /> Issue Description
                </h3>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                  {ticket.description}
                </p>
              </section>

              <div className="mb-4 flex rounded-xl bg-gray-100 p-1 dark:bg-white/5">
                {[
                  { id: "conversation", label: `Conversation (${messages.length})`, icon: MessageSquare },
                  { id: "timeline", label: `Activity History (${logs.length})`, icon: History },
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-1.5 text-xs font-bold transition ${
                        activeTab === tab.id
                          ? "bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white"
                          : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"
                      }`}
                    >
                      <Icon size={13} /> {tab.label}
                    </button>
                  );
                })}
              </div>

              {activeTab === "conversation" ? (
                messages.length === 0 ? (
                  <EmptyPanel icon={MessageSquare} text="No conversation messages yet." />
                ) : (
                  <ul className="space-y-3">
                    {messages.map((message) => (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        isRaiser={String(message.sender_id) === String(ticket.employee_id)}
                      />
                    ))}
                    <div ref={threadEndRef} />
                  </ul>
                )
              ) : logs.length === 0 ? (
                <EmptyPanel icon={History} text="No activity recorded for this ticket." />
              ) : (
                <div className="relative space-y-4 border-l-2 border-gray-100 pl-4 dark:border-white/10">
                  {logs.map((log) => (
                    <div key={log.id} className="relative text-xs">
                      <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-500 dark:border-gray-900" />
                      <div className="flex flex-wrap items-center gap-1.5 text-gray-700 dark:text-gray-300">
                        <span className="font-bold capitalize text-gray-900 dark:text-white">
                          {log.action.replaceAll("_", " ").toLowerCase()}
                        </span>
                        {log.new_status && (
                          <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-bold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                            → {statusMeta(log.new_status).label}
                          </span>
                        )}
                        {/* No performer means the scheduler did it, not a person. */}
                        <span className="text-gray-500">
                          by {log.performer?.name || "Automation"}
                        </span>
                        <span className="ml-auto text-[10px] text-gray-400" title={formatDateTime(log.created_at)}>
                          {formatDateTimeShort(log.created_at)}
                        </span>
                      </div>
                      {log.remarks && <p className="mt-1 italic text-gray-500 dark:text-gray-400">“{log.remarks}”</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Action bar ── */}
            <div className="shrink-0 space-y-3 border-t border-gray-200 bg-gray-50/80 p-4 dark:border-white/10 dark:bg-white/[0.02]">
              {meta?.is_staff && (
                <div className="flex flex-wrap items-center gap-2">
                  {primary && (
                    <button
                      onClick={() => changeStatus(primary)}
                      disabled={busy === primary}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50"
                    >
                      {busy === primary ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                      {busy === primary ? "Saving…" : `Mark ${statusMeta(primary).label}`}
                    </button>
                  )}

                  {/* The remaining transitions, collapsed into one control
                      instead of a row of equally loud coloured buttons. */}
                  {secondary.length > 0 && (
                    <SelectControl
                      value=""
                      disabled={Boolean(busy)}
                      onChange={changeStatus}
                      placeholder="Change status…"
                      options={secondary.map((next) => ({ value: next, label: statusMeta(next).label }))}
                    />
                  )}

                  <SelectControl
                    value=""
                    disabled={busy === "assign" || ticket.status === "closed"}
                    onChange={assignTo}
                    placeholder="Assign to…"
                    options={assignees.map((person) => ({
                      value: person.id,
                      label: person.emp_code ? `${person.name} (${person.emp_code})` : person.name,
                    }))}
                  />

                  {canEscalate && (
                    <button
                      onClick={escalate}
                      disabled={busy === "escalate"}
                      title="Raise the escalation level and notify the staff who can see this ticket"
                      className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/50 dark:bg-transparent dark:text-rose-300 dark:hover:bg-rose-950/40"
                    >
                      <ShieldAlert size={14} /> {busy === "escalate" ? "Escalating…" : "Escalate"}
                    </button>
                  )}
                </div>
              )}

              {meta?.can_reply ? (
                <form onSubmit={sendReply} className="space-y-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      // Ctrl/Cmd+Enter sends, so a reply does not need a trip to
                      // the mouse.
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") sendReply(e);
                    }}
                    rows={3}
                    placeholder={isInternal ? "Write an internal note — the employee will not see this…" : "Write your response…"}
                    className={`w-full rounded-2xl border p-3.5 text-sm outline-none transition focus:ring-2 dark:bg-gray-900 dark:text-white ${
                      isInternal
                        ? "border-amber-300 bg-amber-50/40 focus:border-amber-500 focus:ring-amber-500/20 dark:border-amber-500/40"
                        : "border-gray-200 bg-white focus:border-brand-500 focus:ring-brand-500/20 dark:border-white/10"
                    }`}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {meta?.is_staff ? (
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={isInternal}
                          onChange={(e) => setIsInternal(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                        />
                        <span className={isInternal ? "font-bold text-amber-700 dark:text-amber-400" : ""}>
                          Internal note (hidden from employee)
                        </span>
                      </label>
                    ) : <span />}
                    <button
                      type="submit"
                      disabled={submitting || !replyText.trim()}
                      className={`inline-flex items-center gap-2 rounded-xl px-5 py-2 text-xs font-bold text-white shadow-sm transition disabled:opacity-40 ${
                        isInternal ? "bg-amber-600 hover:bg-amber-700" : "bg-brand-600 hover:bg-brand-700"
                      }`}
                    >
                      <Send size={13} />
                      {submitting ? "Sending…" : isInternal ? "Add Internal Note" : "Send Response"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-gray-100/80 p-3 text-xs font-bold text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                  <Lock size={14} className="text-gray-400" />
                  This ticket is closed and is now read-only.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * A metadata cell.
 *
 * Values wrap to two lines rather than truncating at one — a clipped name or
 * timestamp is worse than a slightly taller card. `title` carries the full
 * value for the cases where two lines still are not enough.
 */
function DetailCard({ icon: Icon, label, value, sub, tone, title, placeholder = "—" }) {
  const shown = value || placeholder;
  const isPlaceholder = !value;

  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-gray-100 bg-white p-3 dark:border-white/5 dark:bg-white/5">
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tone}`}>
        <Icon size={13} />
      </div>
      <div className="min-w-0 flex-1">
        <dt className="text-[9px] font-bold uppercase tracking-wider text-gray-400">{label}</dt>
        <dd
          className={`mt-0.5 break-words text-xs font-bold leading-snug ${
            isPlaceholder ? "text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-white"
          }`}
          title={title || value || placeholder}
          style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
        >
          {shown}
        </dd>
        {sub && <p className="truncate text-[10px] font-medium text-gray-500 dark:text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

/**
 * Message row.
 *
 * The employee who raised the ticket is tinted differently from staff so a long
 * thread can be scanned without reading every name; internal notes stay amber
 * and carry the lock, since that distinction matters most.
 */
function MessageBubble({ message, isRaiser }) {
  const name = message.sender?.name || "Unknown";

  return (
    <li
      className={`rounded-2xl border p-4 transition ${
        message.is_internal
          ? "border-amber-200 bg-amber-50/80 dark:border-amber-500/30 dark:bg-amber-950/20"
          : isRaiser
            ? "border-gray-100 bg-white dark:border-white/5 dark:bg-white/5"
            : "border-brand-100 bg-brand-50/40 dark:border-brand-500/20 dark:bg-brand-950/20"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${avatarTone(name)}`}>
            {initialsOf(name)}
          </span>
          <span className="truncate text-xs font-bold text-gray-900 dark:text-white">{name}</span>
          <span className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            {isRaiser ? "Employee" : "Support"}
          </span>
          {message.is_internal && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
              <Lock size={10} /> Internal
            </span>
          )}
        </div>
        <span className="shrink-0 text-[10px] font-medium text-gray-400" title={formatDateTime(message.created_at)}>
          {formatDateTimeShort(message.created_at)}
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800 dark:text-gray-200">
        {message.message}
      </p>
    </li>
  );
}

function EmptyPanel({ icon: Icon, text }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 py-10 text-center dark:border-white/10">
      <Icon size={24} className="mx-auto text-gray-300 dark:text-gray-600" />
      <p className="mt-2 text-xs font-medium text-gray-400">{text}</p>
    </div>
  );
}

/** A select styled as a button, with the chevron drawn rather than native. */
function SelectControl({ value, onChange, options, placeholder, disabled }) {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled || options.length === 0}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-xl border border-gray-200 bg-white py-2 pl-3 pr-8 text-xs font-bold text-gray-700 outline-none transition hover:bg-gray-50 focus:border-brand-500 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
    </div>
  );
}
