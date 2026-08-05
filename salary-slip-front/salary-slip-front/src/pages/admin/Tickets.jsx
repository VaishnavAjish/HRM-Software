import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  LifeBuoy, Search, Loader2, Eye, Filter, RotateCcw, Inbox, UserCheck,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import TicketDetailDrawer from "../../components/tickets/TicketDetailDrawer";
import {
  STATUS_ORDER, PRIORITY_ORDER, statusMeta, priorityMeta, formatDate,
} from "../../components/tickets/ticketMeta";
import { ticketApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";

/**
 * The staff ticket queue.
 *
 * Company scope is passed through from the header's company switcher, but it can
 * only narrow what the server already allows: /tickets/get applies
 * Ticket::scopeVisibleTo first, so selecting a company the admin does not hold
 * returns nothing rather than leaking it.
 */
export default function Tickets() {
  const { user } = useAuth();
  const { companyScope, companyId } = useCompany();

  const [tickets, setTickets] = useState([]);
  const [counts, setCounts] = useState({});
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [mine, setMine] = useState(false);
  const [search, setSearch] = useState("");
  const [openTicketId, setOpenTicketId] = useState(null);

  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const activeUnit = companyScope?.unit;

  // Every setState lands after an await, so this is safe to call from an effect
  // without cascading a render.
  const requestTickets = async () => {
    try {
      const filters = { status, priority, category_id: categoryId, search, limit: 50 };
      if (mine) filters.mine = 1;
      // Narrowing only. The server has already applied Ticket::scopeVisibleTo,
      // so naming a company the caller does not hold returns nothing rather
      // than widening what they can see.
      if (companyId && companyId !== "all-companies") filters.company_code = companyId;
      if (activeUnit) filters.unit = activeUnit;

      const [listRes, dashRes] = await Promise.all([
        ticketApi.getTickets(accessToken, tokenType, filters),
        ticketApi.getDashboard(accessToken, tokenType),
      ]);

      if (listRes?.status) {
        setTickets(listRes.data?.data ?? []);
        setCounts(listRes.meta?.counts ?? {});
      }
      if (dashRes?.status) setSummary(dashRes.data?.summary ?? null);
    } finally {
      setLoading(false);
    }
  };

  const load = () =>
    requestTickets().catch((err) => toast.error(err.message || "Failed to load tickets"));

  // Spinner raised during render rather than inside the effect — a synchronous
  // setState in an effect body is the cascading render React warns about.
  const filterKey = [status, priority, categoryId, mine, companyId, activeUnit].join("|");
  const [filterSeen, setFilterSeen] = useState(filterKey);
  if (filterSeen !== filterKey) {
    setFilterSeen(filterKey);
    setLoading(true);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    let cancelled = false;
    ticketApi
      .getCategories(accessToken, tokenType)
      .then((res) => { if (!cancelled && res?.status) setCategories(res.data || []); })
      .catch(() => { /* the filter simply stays empty */ });
    return () => { cancelled = true; };
  }, [accessToken, tokenType]);

  const total = Object.values(counts).reduce((sum, n) => sum + Number(n || 0), 0);
  const hasFilters = status || priority || categoryId || mine || search;

  const resetFilters = () => {
    setStatus(""); setPriority(""); setCategoryId(""); setMine(false); setSearch("");
  };

  return (
    <div className="space-y-5 p-2 lg:p-6">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
          <LifeBuoy size={20} />
        </span>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Support Tickets</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Employee requests in your scope — assign, work and resolve them.
          </p>
        </div>
      </header>

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total" value={summary.total} tone="text-gray-900 dark:text-white" />
          <StatCard label="Open" value={summary.by_status?.open} tone="text-blue-600 dark:text-blue-400" />
          <StatCard label="In Progress" value={summary.by_status?.in_progress} tone="text-amber-600 dark:text-amber-400" />
          <StatCard label="Resolved" value={summary.by_status?.resolved} tone="text-green-600 dark:text-green-400" />
          <StatCard label="Assigned to me" value={summary.assigned_to_me} tone="text-purple-600 dark:text-purple-400" icon={UserCheck} />
          <StatCard label="Unassigned" value={summary.unassigned} tone="text-red-600 dark:text-red-400" icon={Inbox} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setStatus("")} className={chipCls(status === "")}>
          All ({total})
        </button>
        {STATUS_ORDER.map((value) => (
          <button key={value} onClick={() => setStatus(value)} className={chipCls(status === value)}>
            {statusMeta(value).label} ({Number(counts[value] || 0)})
          </button>
        ))}

        <div className="mx-1 hidden h-5 w-px bg-gray-200 sm:block dark:bg-white/10" />
        <Filter size={13} className="text-gray-400" />

        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={selectCls}>
          <option value="">All priorities</option>
          {PRIORITY_ORDER.map((value) => (
            <option key={value} value={value}>{priorityMeta(value).label}</option>
          ))}
        </select>

        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={selectCls}>
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            checked={mine}
            onChange={(e) => setMine(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          Assigned to me
        </label>

        {hasFilters && (
          <button
            onClick={resetFilters}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
          >
            <RotateCcw size={12} /> Reset
          </button>
        )}

        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative ml-auto w-full sm:w-64">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ticket no, subject or employee…"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-xs text-gray-900 outline-none transition focus:border-brand-400 focus:bg-white dark:border-white/10 dark:bg-gray-800 dark:text-white"
          />
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
        </form>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#0b0f1a]">
        {loading ? (
          <div className="flex h-56 items-center justify-center">
            <Loader2 className="animate-spin text-brand-500" size={22} />
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center gap-2 text-center">
            <LifeBuoy size={34} className="text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {total === 0 ? "No tickets in your scope yet." : "No tickets match these filters."}
            </p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-gray-100 md:hidden dark:divide-white/10">
              {tickets.map((ticket) => (
                <li key={ticket.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] font-bold text-brand-600 dark:text-brand-400">
                        {ticket.ticket_number}
                      </p>
                      <p className="mt-0.5 break-words font-medium text-gray-900 dark:text-white">{ticket.subject}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {ticket.employee?.name} · {ticket.company_code}
                      </p>
                    </div>
                    <button
                      onClick={() => setOpenTicketId(ticket.id)}
                      className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-900/20"
                    >
                      <Eye size={16} />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant={statusMeta(ticket.status).tone}>{statusMeta(ticket.status).label}</Badge>
                    <Badge variant={priorityMeta(ticket.priority).tone}>{priorityMeta(ticket.priority).label}</Badge>
                    <span className="ml-auto text-[11px] text-gray-400">{formatDate(ticket.created_at)}</span>
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Ticket No</th>
                    <th className="px-4 py-3 font-medium">Employee</th>
                    <th className="px-4 py-3 font-medium">Subject</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Priority</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Assigned To</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                  {tickets.map((ticket) => (
                    <tr key={ticket.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-brand-600 dark:text-brand-400">
                        {ticket.ticket_number}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 dark:text-white">{ticket.employee?.name || "—"}</p>
                        <p className="text-xs text-gray-400">
                          {ticket.employee?.emp_code} · {ticket.company_code}
                        </p>
                      </td>
                      <td className="max-w-[220px] px-4 py-3">
                        <p className="truncate text-gray-800 dark:text-gray-200">{ticket.subject}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{ticket.category?.name || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant={priorityMeta(ticket.priority).tone}>{priorityMeta(ticket.priority).label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusMeta(ticket.status).tone}>{statusMeta(ticket.status).label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                        {ticket.assignee?.name || <span className="text-gray-400">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{formatDate(ticket.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setOpenTicketId(ticket.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
                        >
                          <Eye size={13} /> Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {openTicketId && (
        <TicketDetailDrawer
          ticketId={openTicketId}
          onClose={() => setOpenTicketId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

const selectCls =
  "rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 outline-none dark:border-white/10 dark:bg-gray-800 dark:text-gray-200";

function chipCls(active) {
  return `rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
    active
      ? "bg-brand-600 text-white shadow-sm shadow-brand-600/30"
      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
  }`;
}

function StatCard({ label, value, tone, icon: Icon }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#0b0f1a]">
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
        {Icon && <Icon size={11} />} {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${tone}`}>{Number(value ?? 0)}</p>
    </div>
  );
}
