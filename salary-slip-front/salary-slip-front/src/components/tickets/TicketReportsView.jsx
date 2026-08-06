import React, { useState } from "react";
import toast from "react-hot-toast";
import { Download, FileText, BarChart3, Printer, CheckCircle, ShieldAlert, FileSpreadsheet } from "lucide-react";

export default function TicketReportsView() {
  const [reportType, setReportType] = useState("company_wise");
  const [dateRange, setDateRange] = useState("this_month");
  const [exportFormat, setExportFormat] = useState("xlsx");
  const [generating, setGenerating] = useState(false);

  const reportsList = [
    { id: "company_wise", label: "Company-wise Ticket Report", desc: "Ticket distribution and resolution metrics across companies." },
    { id: "branch_wise", label: "Branch-wise Ticket Report", desc: "Branch unit ticket loads, SLAs, and escalation breakdowns." },
    { id: "department_wise", label: "Department-wise Ticket Report", desc: "Department performance (IT, HR, Payroll, Finance)." },
    { id: "employee_wise", label: "Employee-wise Ticket Report", desc: "Volume of support tickets raised by employee code." },
    { id: "manager_performance", label: "Manager Performance Report", desc: "Response times, approval rates, and delay metrics per manager." },
    { id: "resolution_time", label: "Resolution Time Report", desc: "Average time to first response and final resolution." },
    { id: "escalation", label: "Escalation Report", desc: "Tickets escalated up the hierarchy or bypassed by Super Admin." },
    { id: "sla", label: "SLA Compliance Report", desc: "SLA breaches, warning tickets, and SLA compliance percentages." },
    { id: "high_priority", label: "High & Urgent Priority Report", desc: "Critical priority issues and resolution health." },
    { id: "overdue", label: "Overdue Ticket Report", desc: "Tickets past due date requiring immediate administrative action." },
  ];

  const handleExport = (format) => {
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      toast.success(`Exported ${reportType.replace("_", " ")} report as .${format.toUpperCase()} successfully!`);
    }, 1000);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-4 dark:border-white/10">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Super Admin Reports & Analytics Export</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Generate enterprise performance, SLA compliance, and escalation reports across all companies.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport("csv")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-slate-900 dark:text-gray-200"
          >
            <FileText size={14} /> CSV
          </button>
          <button
            onClick={() => handleExport("pdf")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-900/30 dark:bg-rose-950/40 dark:text-rose-300"
          >
            <Printer size={14} /> PDF
          </button>
          <button
            onClick={() => handleExport("xlsx")}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-700"
          >
            <FileSpreadsheet size={14} /> Export Excel
          </button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reportsList.map((r) => {
          const isSelected = reportType === r.id;
          return (
            <button
              key={r.id}
              onClick={() => setReportType(r.id)}
              className={`flex flex-col justify-between rounded-2xl border p-4 text-left transition ${
                isSelected
                  ? "border-purple-600 bg-purple-50/60 ring-2 ring-purple-500/20 dark:border-purple-500 dark:bg-purple-950/20"
                  : "border-gray-200 bg-white hover:border-gray-300 dark:border-white/10 dark:bg-[#0b0f1a]"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-gray-900 dark:text-white">{r.label}</span>
                  {isSelected && <CheckCircle size={16} className="text-purple-600 dark:text-purple-400" />}
                </div>
                <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">{r.desc}</p>
              </div>
              <div className="mt-4 flex items-center justify-between pt-2 border-t border-gray-100 dark:border-white/10 text-[10px] text-purple-600 font-semibold dark:text-purple-400">
                <span>Click to preview & export</span>
                <span>→</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
