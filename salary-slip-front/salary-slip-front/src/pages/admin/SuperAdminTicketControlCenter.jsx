import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  LayoutDashboard, Inbox, Clock, UserCheck, ShieldAlert,
  PieChart, CheckCircle2, Award, BarChart3, Settings, Network,
} from "lucide-react";
import { ticketApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import SuperAdminTicketDashboard, { HelpdeskMetricCards } from "../../components/tickets/SuperAdminTicketDashboard";
import SuperAdminTicketTable from "../../components/tickets/SuperAdminTicketTable";
import SuperAdminTicketDrawer from "../../components/tickets/SuperAdminTicketDrawer";
import TicketReportsView from "../../components/tickets/TicketReportsView";
import TicketSlaManagementView from "../../components/tickets/TicketSlaManagementView";
import TicketSettingsView from "../../components/tickets/TicketSettingsView";
import TicketHierarchyView from "../../components/tickets/TicketHierarchyView";

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
  { id: "open", label: "Open Tickets", icon: Clock, kind: "status" },
  { id: "assigned", label: "Assigned Tickets", icon: UserCheck, kind: "status" },
  { id: "escalated", label: "Escalated Tickets", icon: ShieldAlert, kind: "status", alert: true },
  { id: "in_progress", label: "In Progress", icon: PieChart, kind: "status" },
  { id: "resolved", label: "Resolved", icon: CheckCircle2, kind: "status" },
  { id: "closed", label: "Closed Archive", icon: Award, kind: "status" },
  { id: "hierarchy", label: "Reporting Hierarchy", icon: Network, kind: "view" },
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
    <div className="space-y-5">
      {/* 1. Metric Cards at Top */}
      <HelpdeskMetricCards
        summary={summary}
        loading={loading}
        onFilterSelect={(id) => {
          const target = SECTIONS.find((s) => s.id === id);
          setActiveSection(target ? target.id : "inbox");
        }}
      />

      {/* 2. Helpdesk Control Navigation Card Bar */}
      <div className="rounded-2xl border border-gray-200 bg-white p-2.5 dark:border-gray-800 dark:bg-gray-900 shadow-xs">
        <div className="flex items-center gap-1.5 xl:gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SECTIONS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            const badge = badgeFor(item);

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={`flex h-9 shrink-0 items-center gap-1.5 sm:gap-2 rounded-xl px-2.5 sm:px-3 text-xs transition-all duration-150 active:scale-95 ${
                  isActive
                    ? "bg-brand-600 font-bold text-white shadow-md shadow-brand-600/30 ring-1 ring-brand-500"
                    : "border border-gray-200/80 bg-gray-50/70 font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                <Icon size={14} className={isActive ? "text-white" : "text-gray-500 dark:text-gray-400"} />
                <span className="whitespace-nowrap">{item.label}</span>
                {badge && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-black leading-none ${
                      isActive
                        ? "bg-red-500 text-white shadow-2xs"
                        : "bg-red-100 text-red-600 dark:bg-red-950/80 dark:text-red-400 border border-red-200 dark:border-red-800/60"
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="w-full space-y-5">
        {activeSection === "dashboard" && (
          <SuperAdminTicketDashboard
            summary={summary}
            tickets={tickets}
            loading={loading}
            hideCards={true}
            search={search}
            onSearchChange={setSearch}
            onRefresh={() => { setLoading(true); load(); }}
            onFilterSelect={(id) => {
              // Cards map onto sections where one exists; "overdue" has no
              // tab of its own, so it opens the full queue.
              const target = SECTIONS.find((s) => s.id === id);
              setActiveSection(target ? target.id : "inbox");
            }}
            onSelectTicket={setActiveTicketId}
          />
        )}

        {activeSection === "hierarchy" && <TicketHierarchyView />}
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
