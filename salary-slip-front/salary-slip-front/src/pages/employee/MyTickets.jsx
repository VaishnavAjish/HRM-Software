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
    <div className="space-y-5 p-2 lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
            <TicketIcon size={20} />
          </span>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">My Tickets</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Everything you have raised, and where it stands.
            </p>
          </div>
        </div>
        <Link
          to="/employee/tickets/new"
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          <Plus size={15} /> Raise Ticket
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-2">
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

        <form
          onSubmit={(e) => { e.preventDefault(); load(); }}
          className="relative ml-auto w-full sm:w-64"
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ticket no. or subject…"
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
          <div className="flex h-56 flex-col items-center justify-center gap-3 text-center">
            <TicketIcon size={34} className="text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {total === 0 ? "You have not raised any tickets yet." : "No tickets match this filter."}
            </p>
            {total === 0 && (
              <Link
                to="/employee/tickets/new"
                className="rounded-lg bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
              >
                Raise your first ticket
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Mobile: cards. The table's six columns cannot fit a phone. */}
            <ul className="divide-y divide-gray-100 md:hidden dark:divide-white/10">
              {tickets.map((ticket) => (
                <li key={ticket.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] font-bold text-brand-600 dark:text-brand-400">
                        {ticket.ticket_number}
                      </p>
                      <p className="mt-0.5 break-words font-medium text-gray-900 dark:text-white">
                        {ticket.subject}
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
                    <span className="text-[11px] text-gray-400">{ticket.category?.name}</span>
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
