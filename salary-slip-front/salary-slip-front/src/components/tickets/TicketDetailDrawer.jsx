import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  X, Send, Clock, User as UserIcon, Building2, Tag, Loader2,
  RotateCcw, Lock, ShieldAlert,
} from "lucide-react";
import Badge from "../ui/Badge";
import { ticketApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { statusMeta, priorityMeta, formatDateTime } from "./ticketMeta";

/**
 * The one ticket detail surface, opened from the employee list and the admin
 * queue alike.
 *
 * What each viewer may do is taken from the server's `meta` block
 * (can_reply / can_reopen / next_statuses / is_staff) rather than re-derived
 * from the user's role here. The API is the thing that enforces those rules, so
 * mirroring its answer keeps the buttons and the outcome in agreement — a
 * locally computed "you can close this" that the server then rejects is worse
 * than not offering it.
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

  const threadEndRef = useRef(null);

  // Pulled out of `user` so the only values these effects depend on are the two
  // strings they actually use — depending on the whole object re-runs them on
  // every unrelated change to the signed-in user.
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;

  // Every setState happens after an await, so calling this from an effect does
  // not cascade a render — same shape as EmployeeMasterTable's loader.
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

  // Raising the spinner during render rather than inside the effect: switching
  // to another ticket must show the loading state, and a synchronous setState in
  // an effect body is exactly the cascading render React warns about.
  const [ticketSeen, setTicketSeen] = useState(ticketId);
  if (ticketSeen !== ticketId) {
    setTicketSeen(ticketId);
    setLoading(true);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  // Only staff can assign, so the list is only fetched for them — an employee
  // requesting it would get a 403 and a toast for something they never asked for.
  useEffect(() => {
    if (!meta?.is_staff) return undefined;

    let cancelled = false;
    ticketApi
      .getAssignees(accessToken, tokenType)
      .then((res) => {
        if (!cancelled && res?.status) setAssignees(res.data || []);
      })
      .catch(() => {
        // Non-fatal: the drawer still works, the assign control just stays empty.
      });

    return () => { cancelled = true; };
  }, [meta?.is_staff, accessToken, tokenType]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [ticket?.messages?.length]);

  const refresh = async () => {
    await load();
    onChanged?.();
  };

  const sendReply = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;

    setSending(true);
    try {
      const res = await ticketApi.reply(
        ticketId,
        { message: reply.trim(), is_internal: internal },
        user?.accessToken,
        user?.tokenType,
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

  const changeStatus = async (status) => {
    setBusyAction(status);
    try {
      const res = await ticketApi.updateStatus(ticketId, { status }, accessToken, tokenType);
      if (res?.status) {
        toast.success(res.message || "Status updated");
        await refresh();
      } else {
        toast.error(res?.message || "Failed to update status");
      }
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
      if (res?.status) {
        toast.success("Ticket assigned");
        await refresh();
      } else {
        toast.error(res?.message || "Failed to assign");
      }
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
        toast.success("Ticket reopened");
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm">
      {/* Clicking away closes, matching the other drawers in the app. */}
      <button
        type="button"
        aria-label="Close ticket details"
        className="flex-1 cursor-default"
        onClick={onClose}
      />

      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl dark:bg-[#0b0f1a]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-white/10">
          <div className="min-w-0">
            {loading ? (
              <div className="h-5 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">
                    {ticket?.ticket_number}
                  </span>
                  <Badge variant={status.tone}>{status.label}</Badge>
                  <Badge variant={priority.tone}>{priority.label}</Badge>
                </div>
                <h2 className="mt-1 break-words text-base font-bold text-gray-900 dark:text-white">
                  {ticket?.subject}
                </h2>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
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
            <p className="text-sm">This ticket is not available.</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <dl className="mb-5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-gray-50 p-3 text-xs dark:bg-white/5">
                <Detail icon={UserIcon} label="Raised by" value={ticket.employee?.name} sub={ticket.employee?.emp_code} />
                <Detail icon={Tag} label="Category" value={ticket.category?.name} />
                <Detail
                  icon={Building2}
                  label="Company / Unit"
                  value={ticket.company_code || "—"}
                  sub={ticket.unit}
                />
                <Detail
                  icon={UserIcon}
                  label="Assigned to"
                  value={ticket.assignee?.name || "Unassigned"}
                  sub={ticket.assignee?.emp_code}
                />
                <Detail icon={Clock} label="Created" value={formatDateTime(ticket.created_at)} />
                <Detail icon={Clock} label="Last activity" value={formatDateTime(ticket.last_activity_at)} />
              </dl>

              <section className="mb-5">
                <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Description
                </h3>
                <p className="whitespace-pre-wrap break-words rounded-xl border border-gray-200 p-3 text-sm text-gray-800 dark:border-white/10 dark:text-gray-200">
                  {ticket.description}
                </p>
              </section>

              <section className="mb-5">
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Conversation
                </h3>
                {(ticket.messages || []).length === 0 ? (
                  <p className="rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-400 dark:border-white/10">
                    No replies yet.
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {ticket.messages.map((message) => {
                      const mine = String(message.sender_id) === String(user?.id);
                      return (
                        <li
                          key={message.id}
                          className={`rounded-xl border p-3 ${
                            message.is_internal
                              ? "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10"
                              : mine
                                ? "border-brand-200 bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/10"
                                : "border-gray-200 bg-white dark:border-white/10 dark:bg-white/5"
                          }`}
                        >
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-gray-900 dark:text-white">
                              {message.sender?.name || "Unknown"}
                            </span>
                            {message.is_internal && <Badge variant="yellow">Internal note</Badge>}
                            <span className="ml-auto text-[10px] text-gray-400">
                              {formatDateTime(message.created_at)}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap break-words text-sm text-gray-700 dark:text-gray-200">
                            {message.message}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div ref={threadEndRef} />
              </section>

              {(ticket.activity_logs || []).length > 0 && (
                <section>
                  <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    Timeline
                  </h3>
                  <ul className="space-y-1.5 border-l border-gray-200 pl-3 dark:border-white/10">
                    {ticket.activity_logs.map((log) => (
                      <li key={log.id} className="text-xs text-gray-500 dark:text-gray-400">
                        <span className="font-semibold text-gray-700 dark:text-gray-200">
                          {log.action.replaceAll("_", " ").toLowerCase()}
                        </span>
                        {log.new_status ? ` → ${statusMeta(log.new_status).label}` : ""}
                        {log.performer?.name ? ` · ${log.performer.name}` : ""}
                        <span className="ml-1 text-gray-400">{formatDateTime(log.created_at)}</span>
                        {log.remarks && (
                          <p className="mt-0.5 italic text-gray-400">“{log.remarks}”</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            <div className="shrink-0 space-y-3 border-t border-gray-200 px-5 py-3 dark:border-white/10">
              {meta?.is_staff && (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value=""
                    disabled={busyAction === "assign" || ticket.status === "closed"}
                    onChange={(e) => assignTo(e.target.value)}
                    className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 outline-none disabled:opacity-50 dark:border-white/10 dark:bg-gray-800 dark:text-gray-200"
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
                      disabled={busyAction === next}
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                    >
                      {busyAction === next ? "Saving…" : `Mark ${statusMeta(next).label}`}
                    </button>
                  ))}
                </div>
              )}

              {meta?.can_reopen && !reopenOpen && (
                <button
                  onClick={() => setReopenOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
                >
                  <RotateCcw size={13} /> Reopen ticket
                </button>
              )}

              {reopenOpen && (
                <form onSubmit={submitReopen} className="space-y-2">
                  <textarea
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    rows={2}
                    required
                    placeholder="Why does this need reopening?"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-white/10 dark:bg-gray-800 dark:text-white"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={busyAction === "reopen"}
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      {busyAction === "reopen" ? "Reopening…" : "Confirm reopen"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setReopenOpen(false); setReopenReason(""); }}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {meta?.can_reply ? (
                <form onSubmit={sendReply} className="space-y-2">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={2}
                    placeholder="Write a reply…"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-white/10 dark:bg-gray-800 dark:text-white"
                  />
                  <div className="flex items-center justify-between gap-3">
                    {meta?.is_staff ? (
                      <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={internal}
                          onChange={(e) => setInternal(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                        Internal note — not shown to the employee
                      </label>
                    ) : <span />}
                    <button
                      type="submit"
                      disabled={sending || !reply.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
                    >
                      <Send size={13} /> {sending ? "Sending…" : "Send"}
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
