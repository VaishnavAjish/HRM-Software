import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Ticket as TicketIcon, Plus, Search, Loader2, Eye } from "lucide-react";
import Badge from "../../components/ui/Badge";
import TicketDetailDrawer from "../../components/tickets/TicketDetailDrawer";
import {
  STATUS_ORDER, statusMeta, priorityMeta, formatDate,
} from "../../components/tickets/ticketMeta";
import { ticketApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";

/**
 * The employee's own tickets.
 *
 * The list is not filtered client-side by employee: /tickets/get already returns
 * only what the caller may see, so there is nothing here that could accidentally
 * widen it.
 */
export default function MyTickets() {
  const { user } = useAuth();

  const [tickets, setTickets] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [openTicketId, setOpenTicketId] = useState(null);

  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;

  // Every setState lands after an await, so this is safe to call from an effect
  // without cascading a render.
  const requestTickets = async () => {
    try {
      const res = await ticketApi.getTickets(accessToken, tokenType, { status, search, limit: 50 });
      if (res?.status) {
        setTickets(res.data?.data ?? []);
        setCounts(res.meta?.counts ?? {});
      }
    } finally {
      setLoading(false);
    }
  };

  const load = () =>
    requestTickets().catch((err) => toast.error(err.message || "Failed to load tickets"));

  // Spinner raised during render, not inside the effect — see the note in
  // TicketDetailDrawer for why.
  const [statusSeen, setStatusSeen] = useState(status);
  if (statusSeen !== status) {
    setStatusSeen(status);
    setLoading(true);
  }

  // `search` is deliberately not a dependency — it is applied on submit so the
  // list does not refetch on every keystroke.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const total = Object.values(counts).reduce((sum, n) => sum + Number(n || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400 shadow-xs">
              <TicketIcon size={22} />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">My Tickets</h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                Spot an issue company related? Raise a ticket.
              </p>
            </div>
          </div>
          <Link
            to="/employee/tickets/new"
            className="hidden sm:inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-all shadow-md shadow-brand-500/20 active:scale-95 hover:bg-brand-700"
          >
            <Plus size={16} /> Raise Ticket
          </Link>
        </header>

        {/* Mobile Raise Ticket Primary CTA */}
        <Link
          to="/employee/tickets/new"
          className="flex sm:hidden h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 text-sm font-bold text-white shadow-md shadow-brand-600/30 active:scale-[0.98] transition-all"
        >
          <Plus size={18} /> Raise New Ticket
        </Link>
      </div>

      {/* Horizontal Scroll Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
        <button
          onClick={() => setStatus("")}
          className={chipCls(status === "")}
        >
          All ({total})
        </button>
        {STATUS_ORDER.map((value) => (
          <button key={value} onClick={() => setStatus(value)} className={chipCls(status === value)}>
            {statusMeta(value).label} ({Number(counts[value] || 0)})
          </button>
        ))}
      </div>

      {/* Search Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); load(); }}
        className="relative w-full"
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ticket no. or subject…"
          className="w-full rounded-2xl border border-gray-200 bg-white dark:bg-[#0b0f1a] py-3 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all shadow-xs focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:text-white"
        />
        <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
      </form>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xs dark:border-white/10 dark:bg-[#0b0f1a]">
        {loading ? (
          <div className="flex h-56 items-center justify-center">
            <Loader2 className="animate-spin text-brand-500" size={24} />
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3 p-6 text-center">
            <TicketIcon size={36} className="text-gray-300 dark:text-gray-600" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {total === 0 ? "You have not raised any tickets yet." : "No tickets match this filter."}
            </p>
            {total === 0 && (
              <Link
                to="/employee/tickets/new"
                className="mt-1 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700"
              >
                Raise your first ticket
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Mobile: Touch-friendly premium cards */}
            <ul className="divide-y divide-gray-100 md:hidden dark:divide-white/10">
              {tickets.map((ticket) => (
                <li
                  key={ticket.id}
                  onClick={() => setOpenTicketId(ticket.id)}
                  className="p-4 active:bg-gray-50 dark:active:bg-white/5 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">
                          {ticket.ticket_number}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenTicketId(ticket.id);
                          }}
                          className="p-1 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400"
                        >
                          <Eye size={18} />
                        </button>
                      </div>
                      <p className="mt-1 font-semibold text-sm leading-snug text-gray-900 dark:text-white line-clamp-2">
                        {ticket.subject}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant={statusMeta(ticket.status).tone}>{statusMeta(ticket.status).label}</Badge>
                    <Badge variant={priorityMeta(ticket.priority).tone}>{priorityMeta(ticket.priority).label}</Badge>
                    {ticket.category?.name && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                        {ticket.category.name}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
                      {formatDate(ticket.created_at)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Ticket No</th>
                    <th className="px-4 py-3 font-medium">Subject</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Priority</th>
                    <th className="px-4 py-3 font-medium">Status</th>
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
                      <td className="max-w-xs px-4 py-3">
                        <p className="truncate font-medium text-gray-900 dark:text-white">{ticket.subject}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{ticket.category?.name || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant={priorityMeta(ticket.priority).tone}>{priorityMeta(ticket.priority).label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusMeta(ticket.status).tone}>{statusMeta(ticket.status).label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{formatDate(ticket.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setOpenTicketId(ticket.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
                        >
                          <Eye size={13} /> View
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

function chipCls(active) {
  return `rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
    active
      ? "bg-brand-600 text-white shadow-sm shadow-brand-600/30"
      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
  }`;
}
