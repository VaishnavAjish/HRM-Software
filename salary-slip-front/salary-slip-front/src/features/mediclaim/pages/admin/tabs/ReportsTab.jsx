import { useEffect, useState } from "react";
import { Download, FileBarChart } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../../../../context/AuthContext";
import Button from "../../../../../components/ui/Button";
import { useMediclaimAuthorization } from "../../../hooks/useMediclaimAuthorization";
import { mediclaimApi } from "../../../services/mediclaimApi";

const inputClass =
  "rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

// The report catalogue from the backend plan's B8 section — the exact
// response shape per type isn't specified there, so this tab renders
// whatever comes back generically (see `ReportResults` below) rather than
// guessing a rigid per-type layout.
const REPORT_TYPES = [
  { value: "enrolled_employees", label: "Enrolled Employees" },
  { value: "covered_members", label: "Covered Members" },
  { value: "claims_by_stage", label: "Claims by Stage" },
  { value: "claims_by_status", label: "Claims by Status" },
  { value: "requested_amounts", label: "Requested Amounts" },
  { value: "approved_amounts", label: "Approved Amounts" },
  { value: "disallowed_amounts", label: "Disallowed Amounts" },
  { value: "settled_amounts", label: "Settled Amounts" },
  { value: "hospital_usage", label: "Hospital Usage" },
  { value: "rejection_reasons", label: "Rejection / Disallowance Reasons" },
  { value: "turnaround_time", label: "Approval Turnaround Time" },
  { value: "pending_overdue", label: "Pending / Overdue Work" },
  { value: "expiring_policies_cards", label: "Expiring Policies / Cards / Eligibility" },
];

/**
 * Filter controls (report type, date range) + a generic results view.
 * Standard results exclude sensitive medical detail server-side; checking
 * "Include sensitive detail" additionally requires
 * `mediclaim.report.reveal` (mirrors the Aadhaar Tier-2 "reveal" convention
 * per the backend plan's B8 section) and is hidden entirely for anyone who
 * doesn't hold that permission.
 */
export default function ReportsTab() {
  const { user } = useAuth();
  const { can } = useMediclaimAuthorization();
  const canReveal = can("mediclaim.report.reveal");
  const canExport = can("mediclaim.report.export");

  const [reportType, setReportType] = useState(REPORT_TYPES[0].value);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reveal, setReveal] = useState(false);
  const [exporting, setExporting] = useState(false);

  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const [submitted, setSubmitted] = useState({ reportType, from, to, reveal, run: 0 });
  const [authSeen, setAuthSeen] = useState({ accessToken, tokenType });
  const [result, setResult] = useState({ key: null, data: null, error: null });

  if (authSeen.accessToken !== accessToken || authSeen.tokenType !== tokenType) {
    setAuthSeen({ accessToken, tokenType });
    setSubmitted((prev) => ({ reportType, from, to, reveal, run: prev.run }));
  }

  const requestKey = JSON.stringify([
    accessToken ?? "",
    tokenType ?? "",
    submitted.reportType,
    submitted.from,
    submitted.to,
    submitted.reveal,
    submitted.run,
  ]);

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;
    mediclaimApi.reports(
      {
        type: submitted.reportType,
        from: submitted.from || undefined,
        to: submitted.to || undefined,
        reveal: submitted.reveal || undefined,
      },
      accessToken,
      tokenType,
    )
      .then((res) => {
        if (cancelled) return;
        setResult({ key: requestKey, data: res?.data ?? null, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({ key: requestKey, data: null, error: err?.message || "Failed to load this report." });
      });
    return () => { cancelled = true; };
  }, [accessToken, tokenType, submitted, requestKey]);

  const loading = Boolean(accessToken) && result.key !== requestKey;
  const state = {
    loading,
    data: loading ? null : result.data,
    error: loading ? null : result.error,
    ranOnce: loading || result.key !== null,
  };

  const runReport = () => {
    if (!accessToken) return;
    setSubmitted((prev) => ({ reportType, from, to, reveal, run: prev.run + 1 }));
  };

  const exportReport = async () => {
    if (!user?.accessToken) return;
    setExporting(true);
    try {
      const res = await mediclaimApi.reports(
        { type: reportType, from: from || undefined, to: to || undefined, reveal: reveal || undefined, export: true, format: "csv" },
        user.accessToken,
        user.tokenType,
      );
      const url = res?.data?.url || res?.data?.downloadUrl;
      if (url) {
        window.location.assign(url);
      } else {
        toast.error("The export request did not return a downloadable file.");
      }
    } catch (err) {
      toast.error(err?.message || "Failed to export this report.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">Report</label>
          <select className={inputClass} value={reportType} onChange={(e) => setReportType(e.target.value)}>
            {REPORT_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">From</label>
          <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">To</label>
          <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {canReveal && (
          <label className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} /> Include sensitive detail
          </label>
        )}
        <Button size="sm" onClick={runReport} disabled={state.loading}>{state.loading ? "Running…" : "Run Report"}</Button>
        {canExport && (
          <Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={exportReport} disabled={exporting}>
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        )}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        {state.loading ? (
          <p className="py-16 text-center text-sm text-gray-400">Loading report…</p>
        ) : state.error ? (
          <p className="py-16 text-center text-sm text-red-500">{state.error}</p>
        ) : !state.ranOnce ? null : (
          <ReportResults data={state.data} />
        )}
      </div>
    </div>
  );
}

/** Renders whatever the report endpoint returns — an array of rows as a
 *  dynamic table, a plain object as a key/value list — rather than assuming
 *  a fixed shape for every report type (the plan flags this as uncertain). */
function ReportResults({ data }) {
  const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : null;

  if (rows) {
    if (rows.length === 0) {
      return (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <FileBarChart size={28} className="text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No data for this report and filter range.</p>
        </div>
      );
    }
    const columns = Object.keys(rows[0]);
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50 dark:text-gray-400">
            <tr>{columns.map((c) => <th key={c} className="px-4 py-3 text-left">{c}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {rows.map((row, i) => (
              <tr key={row.id ?? i}>
                {columns.map((c) => (
                  <td key={c} className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatCell(row[c])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data && typeof data === "object") {
    const entries = Object.entries(data);
    if (entries.length === 0) {
      return <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">This report returned no data.</p>;
    }
    return (
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key} className="rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700">
            <dt className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{key}</dt>
            <dd className="text-sm font-medium text-gray-800 dark:text-gray-100">{formatCell(value)}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">This report returned no data.</p>;
}

function formatCell(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
