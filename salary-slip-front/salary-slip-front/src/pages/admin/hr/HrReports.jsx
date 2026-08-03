import { useState } from "react";
import toast from "react-hot-toast";
import { FileSpreadsheet, FileText, FileDown, Search } from "lucide-react";
import Button from "../../../components/ui/Button";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useCompany } from "../../../context/CompanyContext";
import { hrApi } from "../../../utils/api";
import { downloadExcel, downloadCSV, downloadTablePDF } from "../../../utils/exportUtils";

const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const REPORT_TYPES = [
  { value: "hiring", label: "Hiring Report" },
  { value: "interview", label: "Interview Report" },
  { value: "joining", label: "Joining Report" },
  { value: "attrition", label: "Attrition Report" },
  { value: "asset_allocation", label: "Asset Allocation Report" },
  { value: "performance", label: "Performance Report" },
  { value: "department", label: "Department Report" },
  { value: "hr_kpi", label: "HR KPI Report" },
];

const MAX_PREVIEW_ROWS = 200;

export default function HrReports() {
  const { user } = useAuth();
  const { companyScope } = useCompany();
  const [type, setType] = useState("hiring");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await hrApi.generateReport(type, { from, to, ...companyScope }, user?.accessToken, user?.tokenType);
      if (res.status) setReport(res.data);
    } catch (err) {
      toast.error(err.message || "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const reportLabel = REPORT_TYPES.find((r) => r.value === type)?.label || "HR Report";

  const exportExcel = () => downloadExcel(report.rows, reportLabel.replace(/\s+/g, "_"));
  const exportCsv = () => downloadCSV(report.rows, reportLabel.replace(/\s+/g, "_"));
  const exportPdf = () => downloadTablePDF({
    title: reportLabel,
    subtitle: from || to ? `${from || "…"} to ${to || "…"}` : undefined,
    columns: report.columns,
    rows: report.rows.map((r) => report.columns.map((c) => r[c] ?? "")),
    filename: reportLabel.replace(/\s+/g, "_"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">HR Reports</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Generate and export reports across hiring, performance, assets and workforce data</p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Report Type</label>
            <select className={inputClass} value={type} onChange={(e) => { setType(e.target.value); setReport(null); }}>
              {REPORT_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">From</label>
            <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">To</label>
            <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button icon={<Search size={16} />} onClick={generate} disabled={loading}>{loading ? "Generating..." : "Generate"}</Button>
        </div>
      </div>

      {loading && <SkeletonTable rows={8} />}

      {!loading && report && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700">
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">{reportLabel}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">{report.rows.length} record{report.rows.length === 1 ? "" : "s"}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" icon={<FileSpreadsheet size={14} />} onClick={exportExcel}>Excel</Button>
              <Button variant="secondary" size="sm" icon={<FileDown size={14} />} onClick={exportCsv}>CSV</Button>
              <Button variant="secondary" size="sm" icon={<FileText size={14} />} onClick={exportPdf}>PDF</Button>
            </div>
          </div>

          {report.rows.length === 0 ? (
            <p className="text-center py-16 text-sm text-gray-500 dark:text-gray-400">No data found for the selected filters</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase text-gray-500 dark:text-gray-400">
                    <tr>{report.columns.map((c) => <th key={c} className="text-left px-4 py-3 whitespace-nowrap">{c}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {report.rows.slice(0, MAX_PREVIEW_ROWS).map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        {report.columns.map((c) => <td key={c} className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{String(row[c] ?? "—")}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {report.rows.length > MAX_PREVIEW_ROWS && (
                <p className="text-xs text-gray-400 text-center py-3">
                  Showing first {MAX_PREVIEW_ROWS} of {report.rows.length} rows — use Excel/CSV/PDF export for the full report.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
