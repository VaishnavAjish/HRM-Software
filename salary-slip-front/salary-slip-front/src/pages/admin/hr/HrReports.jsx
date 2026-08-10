import { useState } from "react";
import toast from "react-hot-toast";
import { FileSpreadsheet, FileText, FileDown, Search, Sparkles, Filter, CheckCircle2 } from "lucide-react";
import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useCompany } from "../../../context/CompanyContext";
import { hrApi } from "../../../utils/api";
import { downloadExcel, downloadCSV, downloadTablePDF } from "../../../utils/exportUtils";

const inputClass = "w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-xs font-semibold text-gray-900 dark:text-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all";

const REPORT_TYPES = [
  { value: "hiring", label: "Hiring & Recruitment Report" },
  { value: "interview", label: "Interview Feedback Report" },
  { value: "joining", label: "Employee Joining Report" },
  { value: "attrition", label: "Exit & Attrition Report" },
  { value: "asset_allocation", label: "IT Asset Allocation Report" },
  { value: "performance", label: "Performance Appraisal Report" },
  { value: "department", label: "Department Distribution Report" },
  { value: "hr_kpi", label: "HR KPI & Metrics Summary" },
];

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
    <div className="space-y-6 pb-12 font-sans text-gray-900 dark:text-gray-100">


      {/* Control Card */}
      <div className="rounded-3xl border border-gray-200/80 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Select Report Type</label>
            <select className={inputClass} value={type} onChange={(e) => { setType(e.target.value); setReport(null); }}>
              {REPORT_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">From Date</label>
            <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">To Date</label>
            <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button icon={<Search size={15} />} onClick={generate} disabled={loading}>
            {loading ? "Generating..." : "Generate Analytics"}
          </Button>
        </div>
      </div>

      {loading && <SkeletonTable rows={8} />}

      {!loading && report && (
        <div className="rounded-3xl border border-gray-200/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 overflow-hidden space-y-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">{reportLabel}</h3>
                <Badge variant="green">{report.rows.length} Records</Badge>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" icon={<FileSpreadsheet size={14} />} onClick={exportExcel}>Export Excel</Button>
              <Button variant="secondary" size="sm" icon={<FileDown size={14} />} onClick={exportCsv}>Export CSV</Button>
              <Button variant="secondary" size="sm" icon={<FileText size={14} />} onClick={exportPdf}>Export PDF</Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-100 bg-gray-50/80 uppercase text-gray-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-400">
                <tr>
                  {report.columns.map((c) => (
                    <th key={c} className="px-5 py-3 font-semibold whitespace-nowrap">
                      {c.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {report.rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                    {report.columns.map((c) => (
                      <td key={c} className="px-5 py-3.5 text-gray-700 dark:text-gray-300 font-medium whitespace-nowrap">
                        {row[c] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
