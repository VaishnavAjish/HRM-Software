import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  X, Send, Clock, MessageSquare, History, ShieldAlert, Loader2, Lock,
  User as UserIcon, Building2, Tag, AlertTriangle, Trash2, Copy, Check,
  UserCheck, Briefcase, Calendar, CheckCircle2, Ticket as TicketIcon,
} from "lucide-react";
import { statusMeta, priorityMeta, slaMeta, slaLabel, formatDateTime } from "./ticketMeta";
import { ticketApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";

/**
 * Staff ticket inspector & action drawer.
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

  const copyTicketNumber = () => {
    if (ticket?.ticket_number) {
      navigator.clipboard.writeText(ticket.ticket_number);
      setCopied(true);
      toast.success("Ticket number copied!");
      setTimeout(() => setCopied(false), 2000);
    }
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

  const handleDeleteTicket = async () => {
    if (!window.confirm("Are you sure you want to delete this closed ticket? This action cannot be undone.")) return;
    setBusy("delete");
    try {
      const res = await ticketApi.deleteTicket(ticketId, accessToken, tokenType);
      if (res?.status) {
        toast.success(res.message || "Ticket deleted successfully");
        onClose();
        if (onRefresh) onRefresh();
      } else {
        toast.error(res?.message || "Failed to delete ticket");
      }
    } catch (err) {
      toast.error(err.message || "Failed to delete ticket");
    } finally {
      setBusy(null);
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
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm transition-opacity">
      <button type="button" aria-label="Close" className="flex-1 cursor-default" onClick={onClose} />

      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl dark:bg-[#0b0f1a]">
        {/* Drawer Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 bg-gray-50/50 px-6 py-4 dark:border-white/10 dark:bg-white/[0.02]">
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="space-y-2">
                <div className="h-4 w-32 animate-pulse rounded-md bg-gray-200 dark:bg-gray-700" />
                <div className="h-6 w-3/4 animate-pulse rounded-md bg-gray-200 dark:bg-gray-700" />
              </div>
            ) : ticket ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={copyTicketNumber}
                    title="Click to copy ticket number"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50/80 px-2.5 py-0.5 font-mono text-xs font-bold text-brand-700 transition hover:bg-brand-100 dark:border-brand-900/50 dark:bg-brand-950/50 dark:text-brand-300 dark:hover:bg-brand-900/50"
                  >
                    {ticket.ticket_number}
                    {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} className="opacity-60" />}
                  </button>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide ${s.badgeBg}`}>{s.label}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide ${p.colorCls}`}>{p.label}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${sla.cls}`}>
                    <Clock size={10} /> {slaLabel(ticket)}
                  </span>
                  {ticket.escalation_level > 0 && (
                    <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                      Escalation L{ticket.escalation_level}
                    </span>
                  )}
                </div>
                <h2 className="mt-2 break-words text-lg font-extrabold text-gray-900 dark:text-white">
                  {ticket.subject}
                </h2>
              </>
            ) : (
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Ticket unavailable</h2>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
          >
            <X size={18} />
          </button>
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
              {/* Metadata Cards Grid */}
              <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <DetailCard
                  icon={UserIcon}
                  label="Raised By"
                  value={ticket.employee?.name}
                  sub={ticket.employee?.emp_code ? `(${ticket.employee.emp_code})` : null}
                  iconBg="bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400"
                />
                <DetailCard
                  icon={Tag}
                  label="Category"
                  value={ticket.category?.name}
                  iconBg="bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400"
                />
                <DetailCard
                  icon={Building2}
                  label="Company / Branch"
                  value={ticket.company_code}
                  sub={ticket.unit}
                  iconBg="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
                />
                <DetailCard
                  icon={Briefcase}
                  label="Department"
                  value={ticket.department}
                  iconBg="bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
                />
                <DetailCard
                  icon={UserCheck}
                  label="Assigned To"
                  value={ticket.assignee?.name || "Unassigned"}
                  iconBg="bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400"
                />
                <DetailCard
                  icon={Clock}
                  label="SLA Due"
                  value={formatDateTime(ticket.sla_due_at)}
                  iconBg="bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400"
                />
                <DetailCard
                  icon={Calendar}
                  label="Created"
                  value={formatDateTime(ticket.created_at)}
                  iconBg="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                />
                <DetailCard
                  icon={CheckCircle2}
                  label="First Response"
                  value={formatDateTime(ticket.first_response_at)}
                  iconBg="bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400"
                />
              </div>

              {/* Overdue Alert Banner */}
              {ticket.is_overdue && (
                <div className="mb-5 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/90 p-3.5 text-xs font-medium text-rose-800 shadow-2xs dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">
                    <AlertTriangle size={15} />
                  </div>
                  <div>
                    <p className="font-bold">SLA Target Breached</p>
                    <p className="text-[11px] opacity-90">This ticket has exceeded its resolution SLA target and requires immediate attention.</p>
                  </div>
                </div>
              )}

              {/* Ticket Description */}
              <section className="mb-6 rounded-2xl border border-gray-100 bg-gray-50/60 p-4 dark:border-white/10 dark:bg-white/[0.02]">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <TicketIcon size={14} className="text-brand-500" /> Issue Description
                </h3>
                <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-800 dark:text-gray-200">
                  {ticket.description}
                </p>
              </section>

              {/* Tab Navigation */}
              <div className="mb-4 flex rounded-xl bg-gray-100 p-1 dark:bg-white/5">
                <button
                  onClick={() => setActiveTab("conversation")}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-1.5 text-xs font-bold transition ${
                    activeTab === "conversation"
                      ? "bg-white text-gray-900 shadow-2xs dark:bg-gray-800 dark:text-white"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"
                  }`}
                >
                  <MessageSquare size={13} /> Conversation ({messages.length})
                </button>
                <button
                  onClick={() => setActiveTab("timeline")}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-1.5 text-xs font-bold transition ${
                    activeTab === "timeline"
                      ? "bg-white text-gray-900 shadow-2xs dark:bg-gray-800 dark:text-white"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"
                  }`}
                >
                  <History size={13} /> Activity History ({logs.length})
                </button>
              </div>

              {/* Tab Content */}
              {activeTab === "conversation" ? (
                messages.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 py-10 text-center dark:border-white/10">
                    <MessageSquare size={24} className="mx-auto text-gray-300 dark:text-gray-600" />
                    <p className="mt-2 text-xs font-medium text-gray-400">No conversation messages yet.</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {messages.map((message) => (
                      <li
                        key={message.id}
                        className={`rounded-2xl border p-4 shadow-2xs transition ${
                          message.is_internal
                            ? "border-amber-200 bg-amber-50/80 dark:border-amber-500/30 dark:bg-amber-950/20"
                            : "border-gray-100 bg-white dark:border-white/5 dark:bg-white/5"
                        }`}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700 text-[10px] dark:bg-brand-900/50 dark:text-brand-300">
                              {(message.sender?.name || "U")[0]}
                            </span>
                            <span className="text-xs font-bold text-gray-900 dark:text-white">
                              {message.sender?.name || "Unknown"}
                            </span>
                            {message.is_internal && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
                                <Lock size={10} /> Internal Note
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-medium text-gray-400">
                            {formatDateTime(message.created_at)}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-800 dark:text-gray-200">
                          {message.message}
                        </p>
                      </li>
                    ))}
                    <div ref={threadEndRef} />
                  </ul>
                )
              ) : logs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 py-10 text-center dark:border-white/10">
                  <History size={24} className="mx-auto text-gray-300 dark:text-gray-600" />
                  <p className="mt-2 text-xs font-medium text-gray-400">No activity recorded for this ticket.</p>
                </div>
              ) : (
                <div className="relative border-l-2 border-gray-100 pl-4 space-y-4 dark:border-white/10">
                  {logs.map((log) => (
                    <div key={log.id} className="relative text-xs">
                      <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-500 dark:border-gray-900" />
                      <div className="flex flex-wrap items-center gap-1.5 font-medium text-gray-700 dark:text-gray-300">
                        <span className="font-bold text-gray-900 dark:text-white">
                          {log.action.replaceAll("_", " ").toLowerCase()}
                        </span>
                        {log.new_status && (
                          <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-bold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                            → {statusMeta(log.new_status).label}
                          </span>
                        )}
                        {log.performer?.name && <span className="text-gray-500">by {log.performer.name}</span>}
                        <span className="ml-auto text-[10px] text-gray-400">{formatDateTime(log.created_at)}</span>
                      </div>
                      {log.remarks && <p className="mt-1 italic text-gray-500 dark:text-gray-400">“{log.remarks}”</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer Action Panel */}
            <div className="shrink-0 space-y-4 border-t border-gray-200 bg-gray-50/80 p-5 dark:border-white/10 dark:bg-white/[0.02]">
              {meta?.is_staff && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Assignee Select */}
                    <div className="relative">
                      <select
                        value=""
                        disabled={busy === "assign" || ticket.status === "closed"}
                        onChange={(e) => assignTo(e.target.value)}
                        className="rounded-xl border border-gray-200 bg-white py-2 pl-3 pr-8 text-xs font-bold text-gray-700 shadow-2xs outline-none focus:border-brand-500 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                      >
                        <option value="">Assign ticket to…</option>
                        {assignees.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name} {person.emp_code ? `(${person.emp_code})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Status Transitions */}
                    {(meta.next_statuses || []).map((next) => (
                      <button
                        key={next}
                        onClick={() => changeStatus(next)}
                        disabled={busy === next}
                        className={`rounded-xl px-3.5 py-2 text-xs font-bold shadow-2xs transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 ${statusBtnStyle(next)}`}
                      >
                        {busy === next ? "Saving…" : `Mark ${statusMeta(next).label}`}
                      </button>
                    ))}

                    {/* Escalate Action */}
                    {!["resolved", "closed", "escalated"].includes(ticket.status) && (
                      <button
                        onClick={escalate}
                        disabled={busy === "escalate"}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white shadow-2xs transition-all hover:bg-rose-700 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                      >
                        <ShieldAlert size={14} /> {busy === "escalate" ? "Escalating…" : "Escalate"}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Reply Form / Closed Status */}
              {meta?.can_reply ? (
                <form onSubmit={sendReply} className="space-y-3">
                  <div className="relative">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={2}
                      placeholder="Write your response or internal note…"
                      className="w-full rounded-2xl border border-gray-200 bg-white p-3.5 text-xs outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-gray-900 dark:text-white"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    {meta?.is_staff ? (
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={isInternal}
                          onChange={(e) => setIsInternal(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                        />
                        <span className={isInternal ? "font-bold text-amber-700 dark:text-amber-400" : ""}>
                          Internal Note (Hidden from employee)
                        </span>
                      </label>
                    ) : <span />}
                    <button
                      type="submit"
                      disabled={submitting || !replyText.trim()}
                      className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2 text-xs font-bold text-white shadow-md transition-all hover:bg-brand-700 disabled:opacity-40"
                    >
                      <Send size={13} /> {submitting ? "Sending…" : "Send Response"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-gray-100/80 p-3 text-xs font-bold text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                    <Lock size={14} className="text-gray-400" />
                    This ticket is closed and is now read-only.
                  </div>
                  <button
                    type="button"
                    onClick={handleDeleteTicket}
                    disabled={busy === "delete"}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
                  >
                    <Trash2 size={14} /> {busy === "delete" ? "Deleting Ticket…" : "Delete Closed Ticket"}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DetailCard({ icon: Icon, label, value, sub, iconBg }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-gray-100 bg-white p-3 shadow-2xs dark:border-white/5 dark:bg-white/5">
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
        <Icon size={13} />
      </div>
      <div className="min-w-0 flex-1">
        <dt className="text-[9px] font-bold uppercase tracking-wider text-gray-400">
          {label}
        </dt>
        <dd className="mt-0.5 truncate text-xs font-bold text-gray-900 dark:text-white" title={value || "—"}>
          {value || "—"}
        </dd>
        {sub && <p className="truncate text-[10px] font-medium text-gray-500 dark:text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

const statusBtnStyle = (status) => {
  switch (status) {
    case "resolved":
      return "bg-emerald-600 hover:bg-emerald-700 text-white";
    case "closed":
      return "bg-slate-700 hover:bg-slate-800 text-white";
    case "waiting_employee":
      return "bg-amber-600 hover:bg-amber-700 text-white";
    case "pending_approval":
      return "bg-purple-600 hover:bg-purple-700 text-white";
    case "in_progress":
      return "bg-blue-600 hover:bg-blue-700 text-white";
    case "assigned":
      return "bg-indigo-600 hover:bg-indigo-700 text-white";
    case "escalated":
      return "bg-rose-600 hover:bg-rose-700 text-white";
    default:
      return "bg-brand-600 hover:bg-brand-700 text-white";
  }
};
