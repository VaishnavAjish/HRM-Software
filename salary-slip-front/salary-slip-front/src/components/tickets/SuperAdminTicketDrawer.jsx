import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  X, Send, Clock, MessageSquare, History, ShieldAlert, Loader2, Lock,
  User as UserIcon, Building2, Tag, AlertTriangle,
} from "lucide-react";
import { statusMeta, priorityMeta, slaMeta, slaLabel, formatDateTime } from "./ticketMeta";
import { ticketApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";

/**
 * Staff ticket inspector.
 *
 * Every action here goes to the API and the drawer reloads from the response.
 * The previous version was a demonstration: when the fetch failed it
 * substituted a fabricated ticket ("Rahul Sharma", a four-step SLA timeline,
 * three replies), and Send / Update status / Escalate / Transfer only mutated
 * local state — the toast said "Reply sent to employee" while nothing left the
 * browser and the change vanished on refresh.
 *
 * What the viewer may do comes from the server's `meta` block, so the buttons
 * and the outcome cannot disagree.
 */
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

  // No mock fallback: a ticket that cannot be loaded says so.
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
      .catch(() => { /* the assign control just stays empty */ });

    return () => { cancelled = true; };
  }, [meta?.is_staff, accessToken, tokenType]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [ticket?.messages?.length]);

  const refresh = async () => {
    await load();
    onRefresh?.();
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

  const changeStatus = async (status) => {
    setBusy(status);
    try {
      const res = await ticketApi.updateStatus(ticketId, { status }, accessToken, tokenType);
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm">
      <button type="button" aria-label="Close" className="flex-1 cursor-default" onClick={onClose} />

      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl dark:bg-[#0b0f1a]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-white/10">
          <div className="min-w-0">
            {loading ? (
              <div className="h-5 w-44 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            ) : ticket ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">
                    {ticket.ticket_number}
                  </span>
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${s.badgeBg}`}>{s.label}</span>
                  <span className={`rounded-md px-2 py-0.5 text-[10px] ${p.colorCls}`}>{p.label}</span>
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10px] ${sla.cls}`}>
                    <Clock size={10} /> {slaLabel(ticket)}
                  </span>
                  {ticket.escalation_level > 0 && (
                    <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                      Escalation L{ticket.escalation_level}
                    </span>
                  )}
                </div>
                <h2 className="mt-1 break-words text-base font-bold text-gray-900 dark:text-white">
                  {ticket.subject}
                </h2>
              </>
            ) : (
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Ticket unavailable</h2>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700"
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="animate-spin text-brand-500" size={22} />
          </div>
        ) : !ticket ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-gray-400">
            <ShieldAlert size={30} />
            <p className="text-sm">This ticket could not be loaded, or is outside your access.</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <dl className="mb-5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-gray-50 p-3 text-xs dark:bg-white/5">
                <Detail icon={UserIcon} label="Raised by" value={ticket.employee?.name} sub={ticket.employee?.emp_code} />
                <Detail icon={Tag} label="Category" value={ticket.category?.name} />
                <Detail icon={Building2} label="Company / Branch" value={ticket.company_code} sub={ticket.unit} />
                <Detail icon={UserIcon} label="Department" value={ticket.department} />
                <Detail icon={UserIcon} label="Assigned to" value={ticket.assignee?.name || "Unassigned"} />
                <Detail icon={Clock} label="SLA due" value={formatDateTime(ticket.sla_due_at)} />
                <Detail icon={Clock} label="Created" value={formatDateTime(ticket.created_at)} />
                <Detail icon={Clock} label="First response" value={formatDateTime(ticket.first_response_at)} />
              </dl>

              {ticket.is_overdue && (
                <p className="mb-4 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
                  <AlertTriangle size={14} /> Past its SLA target and still unresolved.
                </p>
              )}

              <section className="mb-5">
                <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">Description</h3>
                <p className="whitespace-pre-wrap break-words rounded-xl border border-gray-200 p-3 text-sm text-gray-800 dark:border-white/10 dark:text-gray-200">
                  {ticket.description}
                </p>
              </section>

              <div className="mb-3 flex gap-2 border-b border-gray-100 dark:border-white/10">
                {[
                  { id: "conversation", label: `Conversation (${messages.length})`, icon: MessageSquare },
                  { id: "timeline", label: `Timeline (${logs.length})`, icon: History },
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 border-b-2 px-2 pb-2 text-xs font-bold transition ${
                        activeTab === tab.id
                          ? "border-brand-600 text-brand-600 dark:text-brand-400"
                          : "border-transparent text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      <Icon size={13} /> {tab.label}
                    </button>
                  );
                })}
              </div>

              {activeTab === "conversation" ? (
                messages.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-gray-200 px-3 py-8 text-center text-xs text-gray-400 dark:border-white/10">
                    No replies yet.
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {messages.map((message) => (
                      <li
                        key={message.id}
                        className={`rounded-xl border p-3 ${
                          message.is_internal
                            ? "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10"
                            : "border-gray-200 bg-white dark:border-white/10 dark:bg-white/5"
                        }`}
                      >
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-gray-900 dark:text-white">
                            {message.sender?.name || "Unknown"}
                          </span>
                          {message.is_internal && (
                            <span className="rounded-md bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
                              Internal note
                            </span>
                          )}
                          <span className="ml-auto text-[10px] text-gray-400">
                            {formatDateTime(message.created_at)}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap break-words text-sm text-gray-700 dark:text-gray-200">
                          {message.message}
                        </p>
                      </li>
                    ))}
                    <div ref={threadEndRef} />
                  </ul>
                )
              ) : logs.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-200 px-3 py-8 text-center text-xs text-gray-400 dark:border-white/10">
                  No activity recorded.
                </p>
              ) : (
                <ul className="space-y-1.5 border-l border-gray-200 pl-3 dark:border-white/10">
                  {logs.map((log) => (
                    <li key={log.id} className="text-xs text-gray-500 dark:text-gray-400">
                      <span className="font-semibold text-gray-700 dark:text-gray-200">
                        {log.action.replaceAll("_", " ").toLowerCase()}
                      </span>
                      {log.new_status ? ` → ${statusMeta(log.new_status).label}` : ""}
                      {log.performer?.name ? ` · ${log.performer.name}` : ""}
                      <span className="ml-1 text-gray-400">{formatDateTime(log.created_at)}</span>
                      {log.remarks && <p className="mt-0.5 italic text-gray-400">“{log.remarks}”</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="shrink-0 space-y-3 border-t border-gray-200 px-5 py-3 dark:border-white/10">
              {meta?.is_staff && (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value=""
                    disabled={busy === "assign" || ticket.status === "closed"}
                    onChange={(e) => assignTo(e.target.value)}
                    className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 disabled:opacity-50 dark:border-white/10 dark:bg-gray-800 dark:text-gray-200"
                  >
                    <option value="">Assign to…</option>
                    {assignees.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name} {person.emp_code ? `(${person.emp_code})` : ""}
                      </option>
                    ))}
                  </select>

                  {(meta.next_statuses || []).map((next) => (
                    <button
                      key={next}
                      onClick={() => changeStatus(next)}
                      disabled={busy === next}
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      {busy === next ? "Saving…" : `Mark ${statusMeta(next).label}`}
                    </button>
                  ))}

                  {!["resolved", "closed", "escalated"].includes(ticket.status) && (
                    <button
                      onClick={escalate}
                      disabled={busy === "escalate"}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      <ShieldAlert size={13} /> {busy === "escalate" ? "Escalating…" : "Escalate"}
                    </button>
                  )}
                </div>
              )}

              {meta?.can_reply ? (
                <form onSubmit={sendReply} className="space-y-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={2}
                    placeholder="Write a reply…"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-white/10 dark:bg-gray-800 dark:text-white"
                  />
                  <div className="flex items-center justify-between gap-3">
                    {meta?.is_staff ? (
                      <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={isInternal}
                          onChange={(e) => setIsInternal(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                        Internal note — not shown to the employee
                      </label>
                    ) : <span />}
                    <button
                      type="submit"
                      disabled={submitting || !replyText.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
                    >
                      <Send size={13} /> {submitting ? "Sending…" : "Send"}
                    </button>
                  </div>
                </form>
              ) : (
                <p className="flex items-center justify-center gap-1.5 rounded-lg bg-gray-50 py-2 text-xs text-gray-500 dark:bg-white/5 dark:text-gray-400">
                  <Lock size={12} /> This ticket is closed and is now read-only.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Detail({ icon: Icon, label, value, sub }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
        <Icon size={11} /> {label}
      </dt>
      <dd className="mt-0.5 break-words text-gray-800 dark:text-gray-200">
        {value || "—"}
        {sub ? <span className="ml-1 text-gray-400">({sub})</span> : null}
      </dd>
    </div>
  );
}
