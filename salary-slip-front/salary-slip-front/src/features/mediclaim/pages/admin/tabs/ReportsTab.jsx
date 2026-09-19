import { useEffect, useState } from "react";
import { Download, FileBarChart } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../../../../context/AuthContext";
import Button from "../../../../../components/ui/Button";
import Badge from "../../../../../components/ui/Badge";
import Pagination from "../../../../../components/ui/Pagination";
import { useMediclaimAuthorization } from "../../../hooks/useMediclaimAuthorization";
import { mediclaimApi } from "../../../services/mediclaimApi";
import { formatClaimDate, formatCurrencyINR } from "../../../utils/formatters";

const inputClass =
  "rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const REPORT_TYPES = [
  { value: "enrolled_employees", label: "Enrolled Employees" },
  { value: "covered_members", label: "Covered Members" },
  { value: "claims", label: "Claims Detail" },
  { value: "amounts", label: "Financial Amounts Summary" },
  { value: "hospital_usage", label: "Hospital Usage" },
  { value: "rejection_reasons", label: "Rejection / Disallowance Reasons" },
  { value: "turnaround", label: "Approval Turnaround Time" },
  { value: "pending_overdue", label: "Pending / Overdue Work" },
  { value: "expiring_policies", label: "Expiring Policies" },
  { value: "expiring_cards", label: "Expiring Cards" },
  { value: "member_eligibility_expiry", label: "Member Eligibility Expiry" },
];

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
        reportType: submitted.reportType,
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
        {
          reportType,
          type: reportType,
          from: from || undefined,
          to: to || undefined,
          reveal: reveal || undefined,
          export: true,
          format: "csv",
        },
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
      <div className="sticky top-0 z-20 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
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

function formatLabel(str) {
  if (!str) return "";
  return String(str)
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/ \w/g, (c) => c.toUpperCase());
}

function formatDashboardValue(key, val) {
  if (val === null || val === undefined || val === "") return "—";

  if (key === "claimsByStatus" && typeof val === "object" && !Array.isArray(val)) {
    const entries = Object.entries(val);
    if (entries.length === 0) return "No claims recorded";
    return entries.map(([status, count]) => `${formatLabel(status)}: ${count}`).join(" • ");
  }

  if (key === "pendingByStage" && Array.isArray(val)) {
    if (val.length === 0) return "No pending claims in review stages";
    return val.map((item) => `${formatLabel(item.stage || item.name)}: ${item.total || item.count || item}`).join(" • ");
  }

  if (key === "amounts" && typeof val === "object" && !Array.isArray(val)) {
    return Object.entries(val)
      .map(([k, amt]) => `${formatLabel(k)}: ${formatCurrencyINR(amt)}`)
      .join(" • ");
  }

  if (key === "hospitalUsage" && Array.isArray(val)) {
    if (val.length === 0) return "No hospital usage data recorded";
    return val
      .map((item) => {
        const name = item.hospital?.name || item.name || `Hospital #${item.hospital_id || ""}`;
        const city = item.hospital?.city ? ` (${item.hospital.city})` : "";
        return `${name}${city}: ${item.total || item.claim_count || item.count || 0} claims`;
      })
      .join(" • ");
  }

  if (key === "enrolledEmployees" && typeof val === "object" && !Array.isArray(val)) {
    return `Total: ${val.total ?? 0} (Active: ${val.active ?? 0})`;
  }

  if (key === "coveredMembers" && typeof val === "object" && !Array.isArray(val)) {
    const rels = val.byRelationship
      ? Object.entries(val.byRelationship)
          .map(([rel, count]) => `${formatLabel(rel)}: ${count}`)
          .join(", ")
      : "";
    return `Total: ${val.total ?? 0}${rels ? ` (${rels})` : ""}`;
  }

  if (key === "rejectionDisallowanceReasonsTop" && Array.isArray(val)) {
    if (val.length === 0) return "No disallowance/rejection reasons recorded";
    return val.map((item) => `${item.reason || item.description || item.category}: ${item.total || item.count || 1}`).join(" • ");
  }

  if (key === "turnaround" && typeof val === "object" && !Array.isArray(val)) {
    return `${val.decidedClaimCount ?? 0} claims decided (Avg: ${val.avgDays ?? 0} days)`;
  }

  if (key === "pendingOverdue" && typeof val === "object" && !Array.isArray(val)) {
    return `Pending: ${val.pendingCount ?? 0} • Overdue: ${val.overdueCount ?? 0}`;
  }

  if (typeof val === "object") {
    try {
      if (Array.isArray(val)) {
        if (val.length === 0) return "None";
        return val.map((item) => (typeof item === "object" ? JSON.stringify(item) : String(item))).join(", ");
      }
      return Object.entries(val)
        .map(([k, v]) => `${formatLabel(k)}: ${typeof v === "number" ? v : String(v)}`)
        .join(" • ");
    } catch {
      return String(val);
    }
  }

  return String(val);
}

function formatCell(key, value) {
  if (value === null || value === undefined || value === "") return "—";

  const keyLower = String(key).toLowerCase();

  if (keyLower.includes("amount") || keyLower.includes("requested") || keyLower.includes("approved") || keyLower.includes("disallowed") || keyLower.includes("settled")) {
    if (typeof value === "number" || !isNaN(Number(value))) {
      return formatCurrencyINR(Number(value));
    }
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (keyLower === "status") {
    const s = String(value).toLowerCase();
    const variantMap = {
      approved: "green",
      active: "green",
      settled: "green",
      closed: "gray",
      rejected: "red",
      overdue: "red",
      draft: "yellow",
      pending: "yellow",
      expiring: "yellow",
    };
    return <Badge variant={variantMap[s] || "gray"}>{formatLabel(value)}</Badge>;
  }

  if (keyLower.includes("date") || keyLower.includes("at") || keyLower === "validto" || keyLower === "expirydate") {
    if (typeof value === "string" && (value.includes("-") || value.includes("T"))) {
      return formatClaimDate(value);
    }
  }

  if (typeof value === "object") {
    if (Array.isArray(value)) {
      if (value.length === 0) return "—";
      return value.map((item) => (typeof item === "object" ? item.name || item.label || JSON.stringify(item) : String(item))).join(", ");
    }
    return value.name || value.label || value.full_name || JSON.stringify(value);
  }

  return String(value);
}

function ReportResults({ data }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  useEffect(() => {
    setCurrentPage(1);
  }, [data]);

  if (!data) {
    return <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">This report returned no data.</p>;
  }

  const columnsMap = data.columns || null;
  const rows = Array.isArray(data.rows) ? data.rows : Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : null;

  if (rows) {
    if (rows.length === 0) {
      return (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <FileBarChart size={28} className="text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No data for this report and filter range.</p>
        </div>
      );
    }

    const columnKeys = columnsMap ? Object.keys(columnsMap) : Object.keys(rows[0]);

    const totalCount = data.meta?.count !== undefined ? data.meta.count : rows.length;
    const startIndex = (currentPage - 1) * pageSize;
    const paginatedRows = rows.slice(startIndex, startIndex + pageSize);

    return (
      <div className="space-y-3">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Total records: <span className="font-bold text-gray-800 dark:text-gray-200">{totalCount}</span>
        </p>
        
        <div className="overflow-auto rounded-xl border border-gray-100 dark:border-gray-700 max-h-[calc(100vh-320px)] min-h-[250px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400 shadow-sm">
              <tr>
                {columnKeys.map((k) => (
                  <th key={k} className="px-4 py-3 text-left font-semibold bg-gray-50 dark:bg-gray-800">
                    {columnsMap ? columnsMap[k] : formatLabel(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {paginatedRows.map((row, i) => (
                <tr key={row.id ?? i} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                  {columnKeys.map((k) => (
                    <td key={k} className="px-4 py-3 text-gray-700 dark:text-gray-200">
                      {formatCell(k, row[k])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          current={currentPage}
          total={totalCount}
          pageSize={pageSize}
          onChange={(page) => setCurrentPage(page)}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
          pageSizeOptions={[10, 15, 25, 50, 100]}
        />
      </div>
    );
  }

  if (typeof data === "object") {
    const entries = Object.entries(data);
    if (entries.length === 0) {
      return <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">This report returned no data.</p>;
    }

    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map(([key, value]) => (
          <div key={key} className="flex flex-col justify-between rounded-xl border border-gray-100 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-800/40">
            <dt className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-400">
              {formatLabel(key)}
            </dt>
            <dd className="text-sm font-semibold text-gray-900 dark:text-white">
              {formatDashboardValue(key, value)}
            </dd>
          </div>
        ))}
      </div>
    );
  }

  return <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">This report returned no data.</p>;
}
