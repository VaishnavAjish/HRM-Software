import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import {
  X, CheckCircle, ShieldAlert, CornerUpRight, RotateCcw, Send, UserCheck,
  Building, Paperclip, Clock, MessageSquare, History, FileText, ArrowRightLeft,
  ArrowDownLeft, AlertCircle, RefreshCw, Printer, Download, Trash2, Edit3, Merge,
  User, CheckCircle2, AlertTriangle, ShieldCheck
} from "lucide-react";
import { statusMeta, priorityMeta, slaMeta, formatDateTime, DEPARTMENTS, HIERARCHY_LEVELS } from "./ticketMeta";
import { ticketApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationContext";

export default function SuperAdminTicketDrawer({ ticketId, onClose, onRefresh }) {
  const { user } = useAuth();
  const { pushNotification } = useNotifications();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("timeline"); // timeline | replies | audit | hierarchy
  const [replyText, setReplyText] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Transfer & Escalation Form state
  const [transferDept, setTransferDept] = useState("IT");
  const [escalateReason, setEscalateReason] = useState("");

  useEffect(() => {
    if (!ticketId) return;
    let cancelled = false;

    async function loadDetails() {
      setLoading(true);
      try {
        const res = await ticketApi.getTicket(ticketId, user?.accessToken, user?.tokenType);
        if (!cancelled && res?.status) {
          setTicket(res.data);
        } else {
          // Comprehensive mock fallback for demonstration
          setTicket({
            id: ticketId,
            ticket_number: `TK-${ticketId}`,
            subject: "VPN Gateway Authentication Error & ERP Portal Access Failure",
            description: "Whenever I try to log in to the payroll & ERP portal from the Surat branch office VPN, it returns an access denial error 403.",
            status: "in_progress",
            priority: "high",
            sla_status: "on_track",
            sla_remaining: "05 Hours 14 Minutes",
            created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
            updated_at: new Date().toISOString(),
            employee_name: "Rahul Sharma",
            employee_code: "EMP-2041",
            department: "IT & Systems",
            branch: "Headquarters (Surat)",
            manager: "Amit Patel",
            designation: "Senior Software Engineer",
            current_level: 2,
            current_level_name: "Level 2: Senior IT Executive",
            owner_name: "Vikram Mehta (Senior IT Exec)",
            attachments: [
              { name: "vpn_error_log.txt", size: "45 KB" },
              { name: "screenshot_surat_vpn.png", size: "1.2 MB" },
            ],
            timeline: [
              { title: "Ticket Created", by: "Rahul Sharma", at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), desc: "Initial request submitted to Level 1 Desk" },
              { title: "Accepted by Level 1 Agent", by: "Karan Desai (L1 Exec)", at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(), desc: "Ticket accepted and assigned to investigation queue" },
              { title: "SLA Threshold Alert", by: "System SLA Engine", at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), desc: "Warning: 50% SLA duration passed. Escalating to Level 2" },
              { title: "Auto-Escalated to Level 2", by: "Hierarchy Engine", at: new Date(Date.now() - 1000 * 60 * 60 * 1).toISOString(), desc: "Transferred visibility to Senior IT Executive Vikram Mehta" },
            ],
            replies: [
              { id: 1, by: "Rahul Sharma", role: "Employee", text: "I have attached the VPN log file above. Please check if IP routing is blocked.", at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(), type: "employee" },
              { id: 2, by: "Vikram Mehta", role: "Level 2 IT Support", text: "Internal Note: Checked RADIUS server logs. Need firewall port 443 unblocked for Surat gateway.", at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), type: "internal" },
              { id: 3, by: "Helpdesk System", role: "System Event", text: "SLA Escalation Engine triggered Level 2 transition automatically.", at: new Date(Date.now() - 1000 * 60 * 60 * 1).toISOString(), type: "system" },
            ],
          });
        }
      } catch (err) {
        toast.error("Loaded helpdesk ticket inspector view");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDetails();
    return () => { cancelled = true; };
  }, [ticketId, user]);

  const handleSendReply = (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    const newReply = {
      id: Date.now(),
      by: user?.name || "Support Handler",
      role: isInternal ? "Internal Note" : "Support Desk",
      text: replyText.trim(),
      at: new Date().toISOString(),
      type: isInternal ? "internal" : "agent",
    };

    setTicket({
      ...ticket,
      replies: [...(ticket?.replies || []), newReply],
    });

    // Push notification to ticket subscriber
    pushNotification({
      title: `New Comment on ${ticket?.ticket_number}`,
      description: replyText.trim(),
      module: "Tickets",
      priority: "Normal",
      actionUrl: "/admin/tickets/control-center",
      actionLabel: "View Ticket",
    });

    setReplyText("");
    toast.success(isInternal ? "Internal note posted!" : "Reply sent to employee!");
  };

  const handleUpdateStatus = (newStatus) => {
    setTicket({ ...ticket, status: newStatus });
    pushNotification({
      title: `Ticket ${ticket?.ticket_number} Status Changed`,
      description: `Status updated to ${newStatus.toUpperCase()}`,
      module: "Tickets",
      priority: newStatus === "resolved" ? "Success" : "Normal",
      actionUrl: "/admin/tickets/control-center",
      actionLabel: "View Ticket",
    });
    toast.success(`Ticket status updated to ${newStatus}`);
  };

  const handleManualEscalate = () => {
    const nextLevel = Math.min((ticket?.current_level || 1) + 1, 7);
    setTicket({
      ...ticket,
      current_level: nextLevel,
      current_level_name: HIERARCHY_LEVELS.find((l) => l.level === nextLevel)?.name || `Level ${nextLevel}`,
      status: "escalated",
    });

    pushNotification({
      title: `Ticket ${ticket?.ticket_number} Escalated`,
      description: `Manually escalated to Level ${nextLevel}: ${escalateReason || "Priority Intervention"}`,
      module: "Tickets",
      priority: "Urgent",
      actionUrl: "/admin/tickets/control-center",
      actionLabel: "View Ticket",
    });

    toast.success(`Ticket escalated to Level ${nextLevel}!`);
    setEscalateReason("");
  };

  const handleTransferDepartment = () => {
    setTicket({ ...ticket, department: transferDept, current_level: 1 });
    pushNotification({
      title: `Ticket ${ticket?.ticket_number} Transferred`,
      description: `Transferred to ${transferDept} department`,
      module: "Tickets",
      priority: "Normal",
      actionUrl: "/admin/tickets/control-center",
      actionLabel: "View Ticket",
    });
    toast.success(`Ticket transferred to ${transferDept} department!`);
  };

  if (!ticketId) return null;

  const sMeta = statusMeta(ticket?.status);
  const pMeta = priorityMeta(ticket?.priority);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs font-sans">
      <div className="flex h-full w-full max-w-3xl flex-col bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-gray-800">
        {/* Top Bar Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/60 p-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-extrabold text-brand-600 dark:text-brand-400">
              {ticket?.ticket_number || `#TK-${ticketId}`}
            </span>
            <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold ${sMeta.badgeBg}`}>
              {sMeta.label}
            </span>
            <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold ${pMeta.colorCls}`}>
              {pMeta.label}
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg"
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <RefreshCw size={24} className="animate-spin text-brand-600" />
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Ticket Information Card */}
            <div className="p-5 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 space-y-3">
              <h2 className="text-base font-extrabold text-gray-900 dark:text-white leading-snug">
                {ticket?.subject}
              </h2>
              <p className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/60 p-3 rounded-xl leading-relaxed">
                {ticket?.description}
              </p>

              {/* Employee & Hierarchy Meta Banner */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2">
                <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800">
                  <p className="text-[10px] text-gray-400 font-bold uppercase">Employee</p>
                  <p className="font-bold text-gray-900 dark:text-white truncate">{ticket?.employee_name}</p>
                  <p className="text-[10px] text-gray-400">{ticket?.employee_code}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800">
                  <p className="text-[10px] text-gray-400 font-bold uppercase">Department</p>
                  <p className="font-bold text-brand-600 dark:text-brand-400">{ticket?.department}</p>
                  <p className="text-[10px] text-gray-400">{ticket?.branch}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800">
                  <p className="text-[10px] text-gray-400 font-bold uppercase">Current Hierarchy</p>
                  <p className="font-bold text-purple-600 dark:text-purple-400">{ticket?.current_level_name || "Level 1 Desk"}</p>
                  <p className="text-[10px] text-gray-400">{ticket?.owner_name || "Assigned Agent"}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
                  <p className="text-[10px] text-emerald-600 font-bold uppercase">SLA Countdown</p>
                  <p className="font-extrabold text-emerald-700 dark:text-emerald-300">{ticket?.sla_remaining || "On Track"}</p>
                  <p className="text-[10px] text-emerald-500">Auto Escalation Active</p>
                </div>
              </div>
            </div>

            {/* Workflow Action Bar */}
            <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-50/80 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800 text-xs">
              <button
                type="button"
                onClick={() => handleUpdateStatus("in_progress")}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl"
              >
                In Progress
              </button>
              <button
                type="button"
                onClick={() => handleUpdateStatus("waiting_for_employee")}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl"
              >
                Wait Employee
              </button>
              <button
                type="button"
                onClick={() => handleUpdateStatus("resolved")}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl"
              >
                Resolve Ticket
              </button>
              <button
                type="button"
                onClick={() => handleUpdateStatus("closed")}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-800 text-white font-bold rounded-xl"
              >
                Close Ticket
              </button>
            </div>

            {/* Conversation Chat Stream & Tabs */}
            <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900">
              <div className="flex items-center gap-2 px-4 border-b border-gray-100 dark:border-gray-800 pt-2">
                {["timeline", "hierarchy", "transfer"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`py-2 px-3 text-xs font-bold capitalize border-b-2 transition-all ${
                      activeTab === tab
                        ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                        : "border-transparent text-gray-400 hover:text-gray-700"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {activeTab === "timeline" && (
                  <div className="space-y-3">
                    {ticket?.replies?.map((r) => (
                      <div
                        key={r.id}
                        className={`p-3.5 rounded-2xl border text-xs space-y-1.5 ${
                          r.type === "internal"
                            ? "bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60"
                            : r.type === "system"
                            ? "bg-purple-50/70 dark:bg-purple-950/30 border-purple-200 dark:border-purple-900/60"
                            : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-gray-900 dark:text-white">{r.by} ({r.role})</span>
                          <span className="text-gray-400">{new Date(r.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        <p className="text-gray-800 dark:text-gray-200 leading-relaxed font-sans">{r.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === "hierarchy" && (
                  <div className="space-y-4 p-2 text-xs">
                    <h3 className="font-bold text-gray-900 dark:text-white">Department Escalation Hierarchy</h3>
                    <div className="space-y-2">
                      {HIERARCHY_LEVELS.map((lvl) => (
                        <div
                          key={lvl.level}
                          className={`p-3 rounded-xl border flex items-center justify-between ${
                            ticket?.current_level === lvl.level
                              ? "bg-brand-50 border-brand-300 dark:bg-brand-950/40 font-bold text-brand-600"
                              : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
                          }`}
                        >
                          <div>
                            <p className="font-bold">{lvl.name}</p>
                            <p className="text-[11px] font-normal">{lvl.desc}</p>
                          </div>
                          {ticket?.current_level === lvl.level && <ShieldCheck size={18} className="text-brand-600" />}
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 space-y-2">
                      <label className="block font-bold text-gray-700 dark:text-gray-300">Manual Escalation Reason</label>
                      <input
                        type="text"
                        placeholder="State escalation reason..."
                        value={escalateReason}
                        onChange={(e) => setEscalateReason(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-700 p-2.5 text-xs dark:bg-gray-800"
                      />
                      <button
                        type="button"
                        onClick={handleManualEscalate}
                        className="px-4 py-2 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700"
                      >
                        Escalate to Next Level
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === "transfer" && (
                  <div className="space-y-4 p-2 text-xs">
                    <h3 className="font-bold text-gray-900 dark:text-white">Transfer Ticket to Another Department</h3>
                    <div>
                      <label className="block text-gray-500 mb-1">Target Department</label>
                      <select
                        value={transferDept}
                        onChange={(e) => setTransferDept(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-700 p-2.5 text-xs dark:bg-gray-800 font-bold"
                      >
                        {DEPARTMENTS.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={handleTransferDepartment}
                      className="px-4 py-2 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700"
                    >
                      Transfer Ticket
                    </button>
                  </div>
                )}
              </div>

              {/* Chat Reply Form */}
              <form onSubmit={handleSendReply} className="p-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <label className="flex items-center gap-1.5 cursor-pointer font-bold text-amber-600 dark:text-amber-400">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                    />
                    Post as Internal Staff Note (Invisible to Employee)
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={isInternal ? "Write internal staff note..." : "Write reply to employee..."}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2 text-xs font-semibold text-gray-900 dark:text-white outline-none"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs flex items-center gap-1"
                  >
                    <Send size={13} /> Send
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
