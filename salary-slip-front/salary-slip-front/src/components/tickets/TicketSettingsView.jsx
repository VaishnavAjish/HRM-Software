import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Tag, RefreshCw, Info } from "lucide-react";
import { ticketApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";

/**
 * Helpdesk settings.
 *
 * Shows the categories employees can raise a ticket against, and the routing
 * department each one carries. This tab previously had no component at all — it
 * fell through the control centre's conditional and rendered the ticket table
 * under a "Settings" heading.
 *
 * Categories are read-only here on purpose: the API exposes the active list but
 * no create/update/delete for them yet, and an editable form that silently
 * discarded edits is the failure mode this whole pass exists to remove.
 */
export default function TicketSettingsView() {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const requestCategories = async () => {
    try {
      const res = await ticketApi.getCategories(accessToken, tokenType);
      if (res?.status) setCategories(res.data || []);
    } finally {
      setLoading(false);
    }
  };

  const load = () =>
    requestCategories().catch((err) => toast.error(err.message || "Failed to load categories"));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4 dark:border-white/10">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Helpdesk Settings</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Ticket categories and the workflow rules currently in force.
          </p>
        </div>
        <button onClick={load} disabled={loading} className={btnGhost} title="Reload">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </header>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-[#0b0f1a]">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-white/10">
          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
            <Tag size={14} className="text-brand-500" /> Ticket Categories
          </h3>
          <span className="text-[11px] text-gray-400">
            {loading ? "Loading…" : `${categories.length} active`}
          </span>
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="animate-spin text-brand-500" size={20} />
          </div>
        ) : categories.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-gray-400">No active categories.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 uppercase tracking-wider text-gray-500 dark:bg-slate-900">
              <tr>
                <th className="p-3.5 font-bold">Category</th>
                <th className="p-3.5 font-bold">Routes To</th>
                <th className="p-3.5 font-bold">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/10">
              {categories.map((category) => (
                <tr key={category.id} className="hover:bg-gray-50/60 dark:hover:bg-white/[0.02]">
                  <td className="p-3.5 font-bold text-gray-900 dark:text-white">{category.name}</td>
                  <td className="p-3.5">
                    {category.default_department ? (
                      <span className="inline-flex rounded-md bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-400">
                        {category.default_department}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="p-3.5 text-gray-600 dark:text-gray-300">{category.description || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-2 rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-[#0b0f1a]">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
          Workflow rules in force
        </h3>
        <ul className="space-y-1.5 text-[11px] leading-relaxed text-gray-600 dark:text-gray-400">
          <li>• A resolved ticket can be reopened by the employee who raised it for 7 days.</li>
          <li>• A closed ticket is read-only: no replies, no status changes, no reassignment.</li>
          <li>• Internal notes are visible to admins and managers only, never to the employee.</li>
          <li>• Company, branch and department are taken from the employee raising the ticket.</li>
          <li>• Ticket history is append-only and is never deleted.</li>
        </ul>
      </section>

      <p className="flex items-start gap-2 rounded-xl bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
        <Info size={14} className="mt-px shrink-0" />
        Editing categories, notification rules and the approval hierarchy are not built yet.
        SLA targets are editable under Department SLA Rules.
      </p>
    </div>
  );
}

const btnGhost =
  "inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-white/10 dark:bg-slate-900 dark:text-gray-200";
