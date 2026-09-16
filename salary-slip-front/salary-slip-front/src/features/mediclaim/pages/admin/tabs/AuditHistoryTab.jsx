import { useEffect, useState } from "react";
import { useAuth } from "../../../../../context/AuthContext";
import { mediclaimApi } from "../../../services/mediclaimApi";
import ClaimsTable from "../../../components/ClaimsTable";
import { formatClaimDate } from "../../../utils/formatters";

const inputClass =
  "rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const PER_PAGE = 20;

const COLUMNS = [
  { key: "actor", label: "Actor", render: (row) => row.actorName || row.actor_name || row.actor?.name || "System" },
  { key: "action", label: "Action", render: (row) => row.action || row.activityType || row.activity_type || row.eventType || row.event_type || "—" },
  {
    key: "subject",
    label: "Subject",
    render: (row) => {
      const type = row.subjectType || row.subject_type;
      const id = row.subjectId || row.subject_id;
      if (!type && !id) return row.claimNumber || row.claim_number || "—";
      return `${type || "—"}${id ? ` #${id}` : ""}`;
    },
  },
  { key: "description", label: "Details", render: (row) => row.description || row.remarks || "—" },
  { key: "timestamp", label: "When", render: (row) => formatClaimDate(row.createdAt || row.created_at) },
];

/**
 * Company-wide Mediclaim audit trail — claim workflow events plus non-claim
 * admin activity (hospital/policy/rule-book/reviewer edits), per the backend
 * plan's B8 (`Mediclaim\Admin\AuditController` reads `mediclaim_claim_events`
 * + `mediclaim_admin_activity_logs`). Simple filterable list; no chart, no
 * fabricated grouping — just what the endpoint returns.
 */
export default function AuditHistoryTab() {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const [result, setResult] = useState({ key: null, rows: [], total: 0, error: null });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const requestKey = JSON.stringify([accessToken ?? "", tokenType ?? "", page, search, from, to]);

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;

    mediclaimApi.audit(
      { page, perPage: PER_PAGE, search: search || undefined, from: from || undefined, to: to || undefined },
      accessToken,
      tokenType,
    )
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        const total = payload?.total ?? rows.length;
        setResult({ key: requestKey, rows, total, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({ key: requestKey, rows: [], total: 0, error: err?.message || "Failed to load the audit history." });
      });

    return () => { cancelled = true; };
  }, [accessToken, tokenType, page, search, from, to, requestKey]);

  const loading = result.key !== requestKey;
  const state = { loading, rows: result.rows, total: result.total, error: loading ? null : result.error };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">Search actor / action</label>
          <input className={inputClass} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Name, action…" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">From</label>
          <input type="date" className={inputClass} value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">To</label>
          <input type="date" className={inputClass} value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
      </div>

      <ClaimsTable
        columns={COLUMNS}
        rows={state.rows}
        loading={state.loading}
        error={state.error}
        emptyMessage="No audit events recorded yet."
        getRowKey={(row) => row.id ?? `${row.createdAt || row.created_at}-${row.actorName || ""}`}
        page={page}
        perPage={PER_PAGE}
        total={state.total}
        onPageChange={setPage}
      />
    </div>
  );
}
