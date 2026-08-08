import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import {
  X, Send, Clock, User as UserIcon, Building2, Tag, Loader2,
  RotateCcw, Lock, ShieldAlert, Copy, Check, Calendar,
  UserCheck, Ticket as TicketIcon, MessageSquare, History,
} from "lucide-react";
import Badge from "../ui/Badge";
import { ticketApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { statusMeta, priorityMeta, formatDateTime } from "./ticketMeta";
import TicketAttachments from "./TicketAttachments";

/**
 * The ticket detail surface.
 */
export default function TicketDetailDrawer({ ticketId, onClose, onChanged }) {
  const { user } = useAuth();

  const [ticket, setTicket] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [busyAction, setBusyAction] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [copied, setCopied] = useState(false);

  const threadEndRef = useRef(null);

  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;

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
  }, [ticket?.messages?.length]);

  const refresh = async () => {
    await load();
    onChanged?.();
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
    if (!reply.trim()) return;

    setSending(true);
    try {
      const res = await ticketApi.reply(
        ticketId,
        { message: reply.trim(), is_internal: internal },
        accessToken,
        tokenType,
      );
      if (res?.status) {
        setReply("");
        setInternal(false);
        await refresh();
      } else {
        toast.error(res?.message || "Failed to send reply");
      }
    } catch (err) {
      toast.error(err.message || "Failed to send reply");
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async (newStatus) => {
    setBusyAction(newStatus);
    try {
      const res = await ticketApi.updateStatus(ticketId, { status: newStatus }, accessToken, tokenType);
      res?.status ? toast.success(res.message || "Status updated") : toast.error(res?.message || "Failed");
      if (res?.status) await refresh();
    } catch (err) {
      toast.error(err.message || "Failed to update status");
    } finally {
      setBusyAction(null);
    }
  };

  const assignTo = async (assignedTo) => {
    if (!assignedTo) return;
    setBusyAction("assign");
    try {
      const res = await ticketApi.assign(ticketId, { assigned_to: Number(assignedTo) }, accessToken, tokenType);
      res?.status ? toast.success("Ticket assigned") : toast.error(res?.message || "Failed to assign");
      if (res?.status) await refresh();
    } catch (err) {
      toast.error(err.message || "Failed to assign");
    } finally {
      setBusyAction(null);
    }
  };

  const submitReopen = async (e) => {
    e.preventDefault();
    if (!reopenReason.trim()) return;

    setBusyAction("reopen");
    try {
      const res = await ticketApi.reopen(ticketId, reopenReason.trim(), accessToken, tokenType);
      if (res?.status) {
        toast.success(res.message || "Ticket reopened");
        setReopenOpen(false);
        setReopenReason("");
        await refresh();
      } else {
        toast.error(res?.message || "Failed to reopen");
      }
    } catch (err) {
      toast.error(err.message || "Failed to reopen");
    } finally {
      setBusyAction(null);
    }
  };

  const status = statusMeta(ticket?.status);
  const priority = priorityMeta(ticket?.priority);

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm transition-opacity">
      <button
        type="button"
        aria-label="Close ticket details"
        className="flex-1 cursor-default"
        onClick={onClose}
      />

      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl dark:bg-[#0b0f1a]">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 bg-gray-50/50 px-6 py-4 dark:border-white/10 dark:bg-white/[0.02]">
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="space-y-2">
                <div className="h-4 w-32 animate-pulse rounded-md bg-gray-200 dark:bg-gray-700" />
                <div className="h-6 w-3/4 animate-pulse rounded-md bg-gray-200 dark:bg-gray-700" />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={copyTicketNumber}
                    title="Click to copy ticket number"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50/80 px-2.5 py-0.5 font-mono text-xs font-bold text-brand-700 transition hover:bg-brand-100 dark:border-brand-900/50 dark:bg-brand-950/50 dark:text-brand-300 dark:hover:bg-brand-900/50"
                  >
                    {ticket?.ticket_number}
                    {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} className="opacity-60" />}
                  </button>
                  <Badge variant={status.tone}>{status.label}</Badge>
                  <Badge variant={priority.tone}>{priority.label}</Badge>
                </div>
                <h2 className="mt-2 break-words text-lg font-extrabold text-gray-900 dark:text-white">
                  {ticket?.subject}
                </h2>
              </>
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
            <p className="text-sm font-medium">This ticket is not available.</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {/* Metadata Grid */}
              <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
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
                  label="Company / Unit"
                  value={ticket.company_code}
                  sub={ticket.unit}
                  iconBg="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
                />
                <DetailCard
                  icon={UserCheck}
                  label="Assigned To"
                  value={ticket.assignee?.name || "Unassigned"}
                  sub={ticket.assignee?.emp_code ? `(${ticket.assignee.emp_code})` : null}
                  iconBg="bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400"
                />
                <DetailCard
                  icon={Calendar}
                  label="Created"
                  value={formatDateTime(ticket.created_at)}
                  iconBg="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                />
                <DetailCard
                  icon={Clock}
                  label="Last Activity"
                  value={formatDateTime(ticket.last_activity_at)}
                  iconBg="bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
                />
              </div>

              {/* Description */}
              <section className="mb-6 rounded-2xl border border-gray-100 bg-gray-50/60 p-4 dark:border-white/10 dark:bg-white/[0.02]">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <TicketIcon size={14} className="text-brand-500" /> Issue Description
                </h3>
                <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-800 dark:text-gray-200">
                  {ticket.description}
                </p>
              </section>

              <TicketAttachments
                ticketId={ticket.id}
                attachments={ticket.attachments || []}
                canManage={Boolean(meta?.is_staff)}
                currentUserId={user?.id}
                onChanged={refresh}
              />

              {/* Messages */}
              <section className="mb-6">
                <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <MessageSquare size={14} className="text-brand-500" /> Conversation ({(ticket.messages || []).length})
                </h3>
                {(ticket.messages || []).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 py-8 text-center dark:border-white/10">
                    <MessageSquare size={24} className="mx-auto text-gray-300 dark:text-gray-600" />
                    <p className="mt-2 text-xs font-medium text-gray-400">No replies yet.</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {ticket.messages.map((message) => {
                      const mine = String(message.sender_id) === String(user?.id);
                      return (
                        <li
                          key={message.id}
                          className={`rounded-2xl border p-4 shadow-2xs transition ${
                            message.is_internal
                              ? "border-amber-200 bg-amber-50/80 dark:border-amber-500/30 dark:bg-amber-950/20"
                              : mine
                                ? "border-brand-200 bg-brand-50/60 dark:border-brand-500/30 dark:bg-brand-950/20"
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
                      );
                    })}
                  </ul>
                )}
                <div ref={threadEndRef} />
              </section>

              {/* Activity Logs */}
              {(ticket.activity_logs || []).length > 0 && (
                <section>
                  <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    <History size={14} className="text-brand-500" /> Activity Log ({(ticket.activity_logs || []).length})
                  </h3>
                  <div className="relative border-l-2 border-gray-100 pl-4 space-y-4 dark:border-white/10">
                    {ticket.activity_logs.map((log) => (
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
                </section>
              )}
            </div>

            {/* Footer Panel */}
            <div className="shrink-0 space-y-4 border-t border-gray-200 bg-gray-50/80 p-5 dark:border-white/10 dark:bg-white/[0.02]">
              {meta?.is_staff && (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value=""
                    disabled={busyAction === "assign" || ticket.status === "closed"}
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

                  {(meta.next_statuses || []).map((next) => (
                    <button
                      key={next}
                      onClick={() => changeStatus(next)}
                      disabled={busyAction === next}
                      className={`rounded-xl px-3.5 py-2 text-xs font-bold shadow-2xs transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 ${statusBtnStyle(next)}`}
                    >
                      {busyAction === next ? "Saving…" : `Mark ${statusMeta(next).label}`}
                    </button>
                  ))}
                </div>
              )}

              {meta?.can_reopen && !reopenOpen && (
                <button
                  onClick={() => setReopenOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 shadow-2xs transition hover:bg-gray-50 dark:border-white/10 dark:bg-gray-800 dark:text-gray-200"
                >
                  <RotateCcw size={14} /> Reopen Ticket
                </button>
              )}

              {reopenOpen && (
                <form onSubmit={submitReopen} className="space-y-3">
                  <textarea
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    rows={2}
                    required
                    placeholder="Why does this need reopening?"
                    className="w-full rounded-2xl border border-gray-200 bg-white p-3 text-xs outline-none focus:border-brand-500 dark:border-white/10 dark:bg-gray-900 dark:text-white"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={busyAction === "reopen"}
                      className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
                    >
                      {busyAction === "reopen" ? "Reopening…" : "Confirm Reopen"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setReopenOpen(false); setReopenReason(""); }}
                      className="rounded-xl px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-200 dark:hover:bg-white/10"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {meta?.can_reply ? (
                <form onSubmit={sendReply} className="space-y-3">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={2}
                    placeholder="Write a response or internal note…"
                    className="w-full rounded-2xl border border-gray-200 bg-white p-3.5 text-xs outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-gray-900 dark:text-white"
                  />
                  <div className="flex items-center justify-between gap-3">
                    {meta?.is_staff ? (
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={internal}
                          onChange={(e) => setInternal(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                        />
                        <span className={internal ? "font-bold text-amber-700 dark:text-amber-400" : ""}>
                          Internal Note (Hidden from employee)
                        </span>
                      </label>
                    ) : <span />}
                    <button
                      type="submit"
                      disabled={sending || !reply.trim()}
                      className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2 text-xs font-bold text-white shadow-md transition-all hover:bg-brand-700 disabled:opacity-40"
                    >
                      <Send size={13} /> {sending ? "Sending…" : "Send Response"}
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
    </div>,
    document.body
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
