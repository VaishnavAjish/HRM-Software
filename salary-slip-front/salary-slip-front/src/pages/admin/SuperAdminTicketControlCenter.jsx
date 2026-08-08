import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  LifeBuoy, LayoutDashboard, Inbox, Clock, CornerUpRight, UserCheck, ShieldAlert,
  PieChart, CheckCircle2, Award, BarChart3, Settings, Search, RefreshCw,
} from "lucide-react";
import { ticketApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import SuperAdminTicketDashboard from "../../components/tickets/SuperAdminTicketDashboard";
import SuperAdminTicketTable from "../../components/tickets/SuperAdminTicketTable";
import SuperAdminTicketDrawer from "../../components/tickets/SuperAdminTicketDrawer";
import TicketReportsView from "../../components/tickets/TicketReportsView";
import TicketSlaManagementView from "../../components/tickets/TicketSlaManagementView";
import TicketSettingsView from "../../components/tickets/TicketSettingsView";

/**
 * The helpdesk control centre.
 *
 * Sections that are not a ticket list (dashboard, reports, SLA rules, settings)
 * render their own component; everything else is the queue filtered by one
 * status. The section ids below are the API's own status values, so a tab
 * cannot drift from a filter the server does not understand — three of the
 * original tabs ("accepted", "waiting_for_employee", "pending_approval" under
 * names the backend never had) could only ever come back empty.
 */

const SECTIONS = [
  { id: "dashboard", label: "Helpdesk Dashboard", icon: LayoutDashboard, kind: "view" },
  { id: "inbox", label: "Ticket Queue (Inbox)", icon: Inbox, kind: "queue" },
  { id: "pending_approval", label: "Pending Approval", icon: CornerUpRight, kind: "status" },
  { id: "open", label: "Open Tickets", icon: Clock, kind: "status" },
  { id: "assigned", label: "Assigned Tickets", icon: UserCheck, kind: "status" },
  { id: "escalated", label: "Escalated Tickets", icon: ShieldAlert, kind: "status", alert: true },
  { id: "in_progress", label: "In Progress", icon: PieChart, kind: "status" },
  { id: "waiting_employee", label: "Waiting Employee", icon: Inbox, kind: "status" },
  { id: "resolved", label: "Resolved", icon: CheckCircle2, kind: "status" },
  { id: "closed", label: "Closed Archive", icon: Award, kind: "status" },
  { id: "sla_management", label: "Department SLA Rules", icon: Clock, kind: "view" },
  { id: "reports", label: "Reports & Analytics", icon: BarChart3, kind: "view" },
  { id: "settings", label: "Helpdesk Settings", icon: Settings, kind: "view" },
];

const QUEUE_KINDS = ["queue", "status"];

export default function SuperAdminTicketControlCenter() {
  const { user } = useAuth();
  const { companyId, companyScope } = useCompany();

  const [activeSection, setActiveSection] = useState("dashboard");
  const [tickets, setTickets] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeTicketId, setActiveTicketId] = useState(null);
  const [search, setSearch] = useState("");

  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const activeUnit = companyScope?.unit;

  const section = SECTIONS.find((s) => s.id === activeSection) ?? SECTIONS[0];
  const showsQueue = QUEUE_KINDS.includes(section.kind);

  // Every setState lands after an await, so calling this from an effect does
  // not cascade a render.
  const requestData = async () => {
    try {
      const filters = { search, limit: 100 };
      if (section.kind === "status") filters.status = section.id;
      if (companyId && companyId !== "all-companies") filters.company_code = companyId;
      if (activeUnit) filters.unit = activeUnit;

      // The dashboard totals are always fetched: the sidebar badges and the
      // cards read from them regardless of which section is open.
      const [listRes, dashRes] = await Promise.all([
        showsQueue || section.id === "dashboard"
          ? ticketApi.getTickets(accessToken, tokenType, filters)
          : Promise.resolve(null),
        ticketApi.getDashboard(accessToken, tokenType),
      ]);

      if (listRes?.status) setTickets(listRes.data?.data ?? []);
      if (dashRes?.status) setSummary(dashRes.data?.summary ?? null);
    } finally {
      setLoading(false);
    }
  };

  const load = () =>
    requestData().catch((err) => toast.error(err.message || "Failed to load helpdesk data"));

  // Spinner raised during render rather than inside the effect.
  const viewKey = [activeSection, companyId, activeUnit].join("|");
  const [viewSeen, setViewSeen] = useState(viewKey);
  if (viewSeen !== viewKey) {
    setViewSeen(viewKey);
    setSelectedIds([]);
    setLoading(true);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey]);

  const byStatus = summary?.by_status || {};

  // Badges come from the same counts the cards use — they were fixed strings
  // ("7" and "5") that never changed no matter what the database held.
  const badgeFor = (item) => {
    if (item.kind !== "status") return null;
    const count = byStatus[item.id];
    return count ? String(count) : null;
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => (prev.length === tickets.length ? [] : tickets.map((t) => t.id)));
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  /**
   * Bulk actions report what actually happened.
   *
   * The previous version caught the failure and announced success "in mock
   * state", so a rejected request looked identical to a completed one.
   */
  const handleBulkAction = async (action, ids, extra = {}) => {
    try {
      const res = await ticketApi.bulk({ action, ids, ...extra }, accessToken, tokenType);

      if (!res?.status) {
        toast.error(res?.message || "Bulk action failed");
        return;
      }

      const failed = res.data?.failed?.length ?? 0;
      const skipped = failed + (res.data?.not_visible ?? 0);
      skipped > 0 ? toast(res.message, { icon: "⚠️" }) : toast.success(res.message);

      setSelectedIds([]);
      await load();
    } catch (err) {
      toast.error(err.message || "Bulk action failed");
    }
  };

  const handleDeleteTicket = async (id) => {
    if (!window.confirm("Are you sure you want to delete this closed ticket? This action cannot be undone.")) {
      return;
    }
    try {
      const res = await ticketApi.deleteTicket(id, accessToken, tokenType);
      if (res?.status) {
        toast.success(res.message || "Ticket deleted successfully");
        if (activeTicketId === id) setActiveTicketId(null);
        await load();
      } else {
        toast.error(res?.message || "Failed to delete ticket");
      }
    } catch (err) {
      toast.error(err.message || "Failed to delete ticket");
    }
  };

  return (
    <div className="space-y-5 p-2 lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
            <LifeBuoy size={20} />
          </span>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-gray-900 dark:text-white">
              Internal Helpdesk
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Ticket queue, assignment, SLA tracking and reporting for your companies.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={(e) => { e.preventDefault(); setLoading(true); load(); }} className="relative w-full sm:w-64">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ticket #, subject, employee…"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-8 pr-3 text-xs text-gray-900 outline-none transition focus:border-brand-500 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
          </form>

          <button
            onClick={() => { setLoading(true); load(); }}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            title="Refresh"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-5 md:flex-row">
        {/* Mobile section switcher */}
        <div className="flex gap-2 overflow-x-auto pb-2 md:hidden">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                activeSection === item.id
                  ? "bg-brand-600 text-white"
                  : "border border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <aside className="hidden w-64 shrink-0 rounded-2xl border border-gray-200 bg-white p-3.5 md:block dark:border-gray-800 dark:bg-gray-900">
          <p className="mb-2 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
            Helpdesk Control
          </p>
          <nav className="space-y-1">
            {SECTIONS.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              const badge = badgeFor(item);

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition ${
                    isActive
                      ? "bg-brand-600 font-bold text-white"
                      : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon size={15} className={item.alert && !isActive && badge ? "text-rose-500" : ""} />
                    <span>{item.label}</span>
                  </div>
                  {badge && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        isActive
                          ? "bg-white/20 text-white"
                          : item.alert
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                            : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1 space-y-5">
          {activeSection === "dashboard" && (
            <SuperAdminTicketDashboard
              summary={summary}
              tickets={tickets}
              loading={loading}
              onFilterSelect={(id) => {
                // Cards map onto sections where one exists; "overdue" has no
                // tab of its own, so it opens the full queue.
                const target = SECTIONS.find((s) => s.id === id);
                setActiveSection(target ? target.id : "inbox");
              }}
              onSelectTicket={setActiveTicketId}
            />
          )}

          {activeSection === "reports" && <TicketReportsView />}
          {activeSection === "sla_management" && <TicketSlaManagementView />}
          {activeSection === "settings" && <TicketSettingsView />}

          {showsQueue && (
            <SuperAdminTicketTable
              tickets={tickets}
              loading={loading}
              onSelectTicket={setActiveTicketId}
              onBulkAction={handleBulkAction}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              onDeleteTicket={handleDeleteTicket}
            />
          )}
        </div>
      </div>

      {activeTicketId && (
        <SuperAdminTicketDrawer
          ticketId={activeTicketId}
          onClose={() => setActiveTicketId(null)}
          onRefresh={load}
        />
      )}
    </div>
  );
}
