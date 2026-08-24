import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  Loader2, RefreshCw, Search, Network, UserPlus, UserMinus, ChevronRight,
  Crown, Info, AlertTriangle, X,
} from "lucide-react";
import { hierarchyApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { initialsOf, avatarTone } from "./ticketMeta";

/**
 * Reporting lines — who a new ticket goes to, and who it climbs to next.
 *
 * Until this screen existed the chain could only be seeded or edited straight
 * in the database, which meant every ticket fell through to the Super Admin.
 *
 * Nothing here decides anything: the four assignment rules (no self-reporting,
 * no inactive manager, same company, no cycles) are the server's, the candidate
 * list is what the server says is allowable, and a save it rejects surfaces the
 * server's own reason rather than a guess at one.
 */
export default function TicketHierarchyView() {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState(null);

  // Every setState lands after an await, so this is safe to call from an effect.
  const requestRows = async () => {
    try {
      const res = await hierarchyApi.list(accessToken, tokenType, {
        search: query,
        unassigned: unassignedOnly ? 1 : undefined,
        page,
        limit: 25,
      });

      if (res?.status) {
        setRows(res.data || []);
        setMeta(res.meta || null);
      }
    } finally {
      setLoading(false);
    }
  };

  const load = () =>
    requestRows().catch((err) => toast.error(err.message || "Failed to load reporting lines"));

  const viewKey = [query, unassignedOnly, page].join("|");
  const [viewSeen, setViewSeen] = useState(viewKey);
  if (viewSeen !== viewKey) {
    setViewSeen(viewKey);
    setLoading(true);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, accessToken]);

  const submitSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setQuery(search.trim());
  };

  const clearManager = async (row) => {
    if (!window.confirm(
      `Remove ${row.name}'s reporting manager? Their new tickets will go straight to the final authority. ` +
      `Tickets already raised keep the chain they were routed through.`,
    )) return;

    try {
      const res = await hierarchyApi.clearManager(row.id, null, accessToken, tokenType);
      res?.status ? toast.success(res.message) : toast.error(res?.message || "Failed");
      if (res?.status) await load();
    } catch (err) {
      toast.error(err.message || "Failed to remove the reporting manager");
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4 dark:border-white/10">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Reporting Hierarchy</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Where a new ticket is routed, and the chain it escalates through.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={submitSearch} className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, code, email or department"
              className="w-56 rounded-xl border border-gray-200 bg-white py-2 pl-8 pr-3 text-xs text-gray-900 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
            />
          </form>

          <button
            type="button"
            onClick={() => { setPage(1); setUnassignedOnly((v) => !v); }}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
              unassignedOnly
                ? "bg-amber-500 text-white"
                : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-slate-900 dark:text-gray-200"
            }`}
          >
            <AlertTriangle size={14} /> No manager
          </button>

          <button onClick={load} disabled={loading} className={btnGhost} title="Reload">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-gray-200 dark:border-white/10">
          <Loader2 className="animate-spin text-brand-500" size={20} />
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-[#0b0f1a]">
          <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 dark:bg-white/5 dark:text-gray-400">
              <tr>
                <th className="p-3.5 font-bold">Employee</th>
                <th className="p-3.5 font-bold">Department</th>
                <th className="p-3.5 font-bold">Reports to</th>
                <th className="p-3.5 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-400">
                    {unassignedOnly
                      ? "Everyone in view has a reporting manager."
                      : "No employees match this search."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/70 dark:hover:bg-white/5">
                    <td className="p-3.5">
                      <Person person={row} />
                    </td>
                    <td className="p-3.5 text-gray-500 dark:text-gray-400">
                      {row.department || "—"}
                    </td>
                    <td className="p-3.5">
                      {row.manager ? (
                        <Person person={row.manager} />
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-900/25 dark:text-amber-400">
                          <AlertTriangle size={12} /> Routes to final authority
                        </span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setEditing(row)}
                          className={iconBtn}
                          title={row.manager ? "Change reporting manager" : "Set reporting manager"}
                        >
                          <UserPlus size={14} />
                        </button>
                        {row.manager && (
                          <button
                            onClick={() => clearManager(row)}
                            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                            title="Remove reporting manager"
                          >
                            <UserMinus size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>

          {meta && meta.last_page > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-3.5 py-2.5 text-[11px] text-gray-500 dark:border-white/10 dark:text-gray-400">
              <span>
                Page {meta.current_page} of {meta.last_page} · {meta.total} employees
              </span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={meta.current_page <= 1}
                  className={pagerBtn}
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={meta.current_page >= meta.last_page}
                  className={pagerBtn}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <p className="flex items-start gap-2 rounded-xl bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
        <Info size={14} className="mt-px shrink-0" />
        Changing a reporting line affects tickets raised from now on. Existing tickets keep the
        chain recorded when they were raised, so their escalation history stays true to what was
        in force at the time. Every chain ends at a Super Admin — the final authority — even when
        no manager is configured.
      </p>

      {editing && (
        <ManagerPicker
          employee={editing}
          accessToken={accessToken}
          tokenType={tokenType}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}
    </div>
  );
}

/**
 * Choose a manager, with the resulting chain shown before and after.
 *
 * The chain preview is the point: an admin picking a name has no other way to
 * see that they are about to send this person's tickets three levels sideways.
 */
function ManagerPicker({ employee, accessToken, tokenType, onClose, onSaved }) {
  const [candidates, setCandidates] = useState([]);
  const [chain, setChain] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(employee.manager?.id ?? "");
  const [reason, setReason] = useState("");
  const [filter, setFilter] = useState("");

  const requestOptions = async () => {
    try {
      const [candidateRes, chainRes] = await Promise.all([
        hierarchyApi.getCandidates(employee.id, accessToken, tokenType),
        hierarchyApi.getChain(employee.id, accessToken, tokenType),
      ]);

      if (candidateRes?.status) setCandidates(candidateRes.data || []);
      if (chainRes?.status) setChain(chainRes.data?.chain || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    requestOptions().catch((err) => toast.error(err.message || "Failed to load managers"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id]);

  const save = async () => {
    if (!selected) return;

    setSaving(true);
    try {
      const res = await hierarchyApi.setManager(
        employee.id,
        { manager_user_id: Number(selected), reason: reason.trim() || null },
        accessToken,
        tokenType,
      );

      if (res?.status) {
        toast.success(res.message || "Reporting manager updated");
        await onSaved();
        return;
      }

      // 422s carry the guard that refused it — self-reporting, a departed
      // manager, another company, or a loop.
      toast.error(res?.message || "Failed to set the reporting manager");
    } catch (err) {
      toast.error(err.message || "Failed to set the reporting manager");
    } finally {
      setSaving(false);
    }
  };

  const visible = filter
    ? candidates.filter((c) =>
        [c.name, c.emp_code, c.department, c.email]
          .filter(Boolean)
          .some((field) => field.toLowerCase().includes(filter.toLowerCase())),
      )
    : candidates;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#0b0f1a]">
        <header className="flex items-start justify-between gap-3 border-b border-gray-100 p-4 dark:border-white/10">
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
              Reporting manager for {employee.name}
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Only people who pass the assignment rules are listed.
            </p>
          </div>
          <button onClick={onClose} className={iconBtn} title="Close">
            <X size={16} />
          </button>
        </header>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-4">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="animate-spin text-brand-500" size={20} />
            </div>
          ) : (
            <>
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  <Network size={12} /> Current escalation chain
                </p>
                <ChainStrip chain={chain} />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                  New manager
                </label>
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter by name, code or department"
                  className={`${inputCls} mb-2`}
                />

                {visible.length === 0 ? (
                  <p className="rounded-xl bg-amber-50 p-3 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                    {candidates.length === 0
                      ? "Nobody may be assigned as this employee's manager — an eligible manager must be active, hold a staff role, and share a company with them."
                      : "No eligible manager matches that filter."}
                  </p>
                ) : (
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-gray-200 p-1.5 dark:border-white/10">
                    {visible.map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => setSelected(candidate.id)}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                          Number(selected) === candidate.id
                            ? "bg-brand-50 ring-1 ring-brand-400 dark:bg-brand-900/25"
                            : "hover:bg-gray-50 dark:hover:bg-white/5"
                        }`}
                      >
                        <Person person={candidate} />
                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          {candidate.department || "—"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Reason <span className="font-normal text-gray-400">(optional, kept on the record)</span>
                </label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Moved to the Payroll team"
                  maxLength={500}
                  className={inputCls}
                />
              </div>
            </>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-gray-100 p-4 dark:border-white/10">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !selected || loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {saving ? "Saving…" : "Set manager"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function ChainStrip({ chain }) {
  if (!chain || chain.length === 0) {
    return (
      <p className="rounded-xl bg-gray-50 p-2.5 text-[11px] text-gray-500 dark:bg-white/5 dark:text-gray-400">
        No chain resolved — there is no active Super Admin for this employee's company.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-gray-50 p-2.5 dark:bg-white/5">
      {chain.map((entry, index) => (
        <span key={entry.user_id} className="flex items-center gap-1.5">
          {index > 0 && <ChevronRight size={12} className="text-gray-400" />}
          <span
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold ${
              entry.is_final_authority
                ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                : "bg-white text-gray-700 shadow-2xs dark:bg-slate-900 dark:text-gray-200"
            }`}
          >
            {entry.is_final_authority && <Crown size={11} />}
            L{entry.level} · {entry.name}
          </span>
        </span>
      ))}
    </div>
  );
}

function Person({ person }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${avatarTone(person.name)}`}
      >
        {initialsOf(person.name)}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-bold text-gray-900 dark:text-white">{person.name}</span>
        <span className="block truncate text-[10px] text-gray-400">{person.emp_code || person.email}</span>
      </span>
    </span>
  );
}

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-slate-900 dark:text-white";

const btnGhost =
  "inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-white/10 dark:bg-slate-900 dark:text-gray-200";

const iconBtn =
  "rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-900/20";

const pagerBtn =
  "rounded-lg border border-gray-200 px-2.5 py-1 font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5";
