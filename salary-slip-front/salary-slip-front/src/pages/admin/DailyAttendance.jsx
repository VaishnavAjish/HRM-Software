import { useEffect, useMemo, useState, useRef } from "react";
import toast from "react-hot-toast";
import {
  Building2,
  Download,
  CloudUpload,
  Loader2,
  Calendar,
} from "lucide-react";
import { parseSheetToRows, saveAoaToXlsx } from "../../utils/excel";
import Button from "../../components/ui/Button";
import { salaryApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { getCompanyConfig, COMPANY_OPTIONS } from "../../config/companyConfig";
import UploadBatchPanel from "../../components/admin/UploadBatchPanel";
import BulkAttendanceValidation from "../../components/admin/BulkAttendanceValidation";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const YEARS = ["2024", "2025", "2026", "2027", "2028", "2029", "2030"];

// Cycling through a cell click: blank -> present -> absent -> half_day -> leave -> blank
const STATUS_CYCLE = [null, "present", "absent", "half_day", "leave"];

const STATUS_STYLE = {
  present: { label: "P", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  absent: { label: "A", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  half_day: { label: "H", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  leave: { label: "L", cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
};

function daysInMonth(month, year) {
  return new Date(Number(year), Number(month), 0).getDate();
}

function findColumnIndex(headers, aliases) {
  return headers.findIndex((h) => {
    const norm = String(h ?? "").trim().toLowerCase();
    return aliases.some((alias) => norm === alias || norm.includes(alias));
  });
}

export default function DailyAttendance() {
  const { user } = useAuth();
  const { companyId, activeUnit, isAllCompanies } = useCompany();

  const [selectedCompanyId, setSelectedCompanyId] = useState(companyId !== "all" ? companyId : "");
  const [selectedUnit, setSelectedUnit] = useState(activeUnit || "");
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

  const [gridLoading, setGridLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({});
  const [savingCell, setSavingCell] = useState(null);
  // A ref lock (not state) so a second click on the same cell within the
  // same tick — before the "saving" state re-render lands — is still
  // blocked synchronously, closing the double-submit race that caused
  // duplicate INSERTs on the same (emp_code, company_code, date).
  const inFlightCellsRef = useRef(new Set());

  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [reloadCounter, setReloadCounter] = useState(0);
  const [justUploadedBatchId, setJustUploadedBatchId] = useState(null);
  const [showValidation, setShowValidation] = useState(false);

  const fileInputRef = useRef(null);

  const activeCompanyConfig = getCompanyConfig(selectedCompanyId);
  const unitOptions = activeCompanyConfig ? activeCompanyConfig.units : [];
  const totalDays = daysInMonth(selectedMonth, selectedYear);
  const dayList = useMemo(() => Array.from({ length: totalDays }, (_, i) => i + 1), [totalDays]);

  useEffect(() => {
    if (!selectedCompanyId) return undefined;
    let cancelled = false;

    async function load() {
      setGridLoading(true);
      try {
        const res = await salaryApi.getAttendanceGrid(user?.accessToken, user?.tokenType, {
          companyId: selectedCompanyId,
          unit: selectedUnit,
          month: selectedMonth,
          year: selectedYear,
        });
        if (cancelled) return;
        setEmployees(res?.data?.employees || []);
        setAttendanceMap(res?.data?.attendance || {});
      } catch (err) {
        if (!cancelled) toast.error(err.message || "Failed to load attendance");
      } finally {
        if (!cancelled) setGridLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedCompanyId, selectedUnit, selectedMonth, selectedYear, reloadCounter, user?.accessToken, user?.tokenType]);

  const handleCellClick = async (empCode, day) => {
    const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const cellKey = `${empCode}-${dateStr}`;

    if (inFlightCellsRef.current.has(cellKey)) return;
    inFlightCellsRef.current.add(cellKey);

    const current = attendanceMap[empCode]?.[dateStr] || null;
    const nextIdx = (STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length;
    const next = STATUS_CYCLE[nextIdx];

    setSavingCell(cellKey);
    setAttendanceMap((prev) => ({
      ...prev,
      [empCode]: { ...prev[empCode], [dateStr]: next },
    }));

    try {
      await salaryApi.updateAttendanceCell(
        { emp_code: empCode, date: dateStr, status: next, company_code: selectedCompanyId, unit: selectedUnit },
        user?.accessToken,
        user?.tokenType,
      );
    } catch (err) {
      setAttendanceMap((prev) => ({
        ...prev,
        [empCode]: { ...prev[empCode], [dateStr]: current },
      }));
      toast.error(err.message || "Failed to update attendance");
    } finally {
      inFlightCellsRef.current.delete(cellKey);
      setSavingCell(null);
    }
  };

  const downloadTemplate = () => {
    if (!selectedCompanyId) {
      toast.error("Please select a company to download the template.");
      return;
    }
    if (employees.length === 0) {
      toast.error("No employees found for this company/branch.");
      return;
    }

    const headers = ["Employee Code", "Employee Name", ...dayList.map(String)];
    const rows = employees.map((emp) => [emp.emp_code ?? "", emp.name ?? "", ...dayList.map(() => "")]);

    const monthLabel = MONTHS[parseInt(selectedMonth, 10) - 1].toLowerCase();
    saveAoaToXlsx(`${selectedCompanyId}_attendance_${monthLabel}_${selectedYear}.xlsx`, "Attendance", [headers, ...rows]);
    toast.success("Template downloaded — fill P/A/H/L per day and upload it back");
  };

  const parseExcelPreview = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      return await parseSheetToRows(arrayBuffer);
    } catch {
      throw new Error("Could not read file. Make sure it is a valid Excel file.");
    }
  };

  const validateAndSetFile = async (file) => {
    if (!file) return;
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    if (!allowed.includes(file.type) && !/\.(xlsx|xls)$/i.test(file.name)) {
      toast.error("Only Excel files (.xlsx, .xls) are allowed.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File is too large. Please upload under 10 MB.");
      return;
    }
    try {
      const data = await parseExcelPreview(file);
      setUploadPreview(data);
      setShowValidation(true);
    } catch (err) {
      toast.error(err.message);
      setUploadPreview(null);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const clearFile = (e) => {
    e?.stopPropagation();
    setUploadPreview(null);
    setShowValidation(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleValidationConfirm = async (validRows) => {
    if (!selectedCompanyId) {
      toast.error("Select a company first.");
      return;
    }

    const headers = uploadPreview.headers;
    const empCodeColIdx = findColumnIndex(headers, ["employee code", "emp code", "code"]);
    const dayColIdxs = headers.reduce((acc, h, idx) => {
      const n = parseInt(String(h).trim(), 10);
      if (String(h).trim() !== "" && !Number.isNaN(n) && n >= 1 && n <= 31) acc[idx] = n;
      return acc;
    }, {});

    const rows = validRows.map((values) => {
      const days = {};
      Object.entries(dayColIdxs).forEach(([idx, dayNum]) => {
        const val = String(values[idx] ?? "").trim();
        if (val) days[dayNum] = val;
      });
      return { emp_code: String(values[empCodeColIdx] ?? "").trim(), days };
    });

    setUploading(true);
    try {
      const res = await salaryApi.importAttendance(
        {
          company_code: selectedCompanyId,
          unit: selectedUnit,
          month: selectedMonth,
          year: selectedYear,
          rows,
        },
        user?.accessToken,
        user?.tokenType,
      );

      const skipped = res?.skipped ?? [];
      toast.success(
        skipped.length > 0
          ? `Updated ${res?.imported ?? 0} employee(s). Skipped ${skipped.length} due to issues.`
          : `Updated attendance for ${res?.imported ?? 0} employee(s).`,
      );

      clearFile();
      setReloadCounter((prev) => prev + 1);
      if (res?.batch_id) setJustUploadedBatchId(res.batch_id);
    } catch (error) {
      toast.error(error.message || "Failed to upload attendance");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col xl:flex-row gap-6">
      <div className="w-full xl:w-96 flex-shrink-0 flex flex-col gap-4">
        <UploadBatchPanel
          type="attendance"
          icon={Calendar}
          refreshKey={reloadCounter}
          companyId={selectedCompanyId || companyId}
          autoOpenBatchId={justUploadedBatchId}
        />
      </div>

      <div className="flex-1 flex flex-col gap-6 min-w-0">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-white/10 dark:bg-white/[0.03]">
          <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400 mb-4">
            <Building2 size={13} /> Selection Options
          </h4>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400">
                Company <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedCompanyId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedCompanyId(nextId);
                  const nextConf = getCompanyConfig(nextId);
                  if (nextConf && !nextConf.units.includes(selectedUnit)) setSelectedUnit("");
                }}
                disabled={!isAllCompanies}
                className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-slate-950/60 dark:text-white disabled:opacity-50"
              >
                <option value="">Select Company</option>
                {COMPANY_OPTIONS.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400">
                Branch/Unit
              </label>
              <select
                value={selectedUnit}
                onChange={(e) => setSelectedUnit(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-slate-950/60 dark:text-white"
              >
                <option value="">All Branches</option>
                {unitOptions.map((unit) => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400">
                Month
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-slate-950/60 dark:text-white"
              >
                {MONTHS.map((m, idx) => (
                  <option key={m} value={String(idx + 1)}>{m}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400">
                Year
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-slate-950/60 dark:text-white"
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              variant="secondary"
              icon={<Download size={14} />}
              onClick={downloadTemplate}
              disabled={!selectedCompanyId}
            >
              Download Excel Template
            </Button>
          </div>
        </div>

        {showValidation && uploadPreview ? (
          <BulkAttendanceValidation
            headers={uploadPreview.headers}
            rawRows={uploadPreview.rows}
            onConfirm={handleValidationConfirm}
            onCancel={clearFile}
            uploading={uploading}
          />
        ) : (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition ${
                dragOver
                  ? "border-brand-500 bg-brand-50/20 dark:bg-brand-950/10"
                  : "border-gray-300 dark:border-white/10 hover:border-brand-400 hover:bg-gray-50/50 dark:hover:bg-white/[0.01]"
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".xlsx,.xls"
                className="hidden"
              />
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400 mb-3">
                <CloudUpload size={18} />
              </div>
              <p className="text-sm font-semibold text-gray-700 dark:text-slate-200">
                Drag and drop your filled-in attendance sheet here, or <span className="text-brand-600">browse</span>
              </p>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                Download the template above, fill P/A/H/L per day, then upload it back
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white dark:bg-[#0b0f1a] dark:border-white/10 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-200 dark:border-white/10 px-5 py-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Daily Attendance Grid</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Click a cell to cycle Present → Absent → Half Day → Leave → blank</p>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-semibold">
                  <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Present</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Absent</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Half Day</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> Leave</span>
                </div>
              </div>

              {!selectedCompanyId ? (
                <div className="py-16 text-center text-sm text-gray-400">Select a company to view attendance.</div>
              ) : gridLoading ? (
                <div className="py-16 flex items-center justify-center text-gray-400">
                  <Loader2 size={20} className="animate-spin" />
                </div>
              ) : employees.length === 0 ? (
                <div className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">No employees found for this company/branch.</div>
              ) : (
                <div className="overflow-auto" style={{ maxHeight: "60vh" }}>
                  <table className="min-w-max table-fixed text-left text-xs border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-gray-100 dark:bg-gray-800">
                        <th className="sticky left-0 z-20 bg-gray-100 dark:bg-gray-800 px-3 py-2.5 font-semibold text-gray-500 dark:text-gray-400 border-b border-r border-gray-200 dark:border-gray-700" style={{ width: 110 }}>Emp Code</th>
                        <th className="sticky z-20 bg-gray-100 dark:bg-gray-800 px-3 py-2.5 font-semibold text-gray-500 dark:text-gray-400 border-b border-r border-gray-200 dark:border-gray-700" style={{ width: 170, left: 110 }}>Name</th>
                        {dayList.map((day) => (
                          <th key={day} className="px-1 py-2.5 text-center font-semibold text-gray-500 dark:text-gray-400 border-b border-r border-gray-200 dark:border-gray-700" style={{ width: 34 }}>
                            {day}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((emp, i) => {
                        const even = i % 2 === 0;
                        return (
                          <tr key={emp.id} className={even ? "bg-white dark:bg-[#0b0f1a]" : "bg-gray-50/50 dark:bg-white/[0.02]"}>
                            <td className={`sticky left-0 z-10 px-3 py-1.5 font-mono text-gray-600 dark:text-gray-300 border-b border-r border-gray-100 dark:border-gray-800 ${even ? "bg-white dark:bg-[#0b0f1a]" : "bg-gray-50 dark:bg-[#0d1220]"}`}>
                              {emp.emp_code}
                            </td>
                            <td className={`sticky z-10 px-3 py-1.5 truncate text-gray-800 dark:text-gray-200 border-b border-r border-gray-100 dark:border-gray-800 ${even ? "bg-white dark:bg-[#0b0f1a]" : "bg-gray-50 dark:bg-[#0d1220]"}`} style={{ left: 110 }} title={emp.name}>
                              {emp.name}
                            </td>
                            {dayList.map((day) => {
                              const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                              const status = attendanceMap[emp.emp_code]?.[dateStr] || null;
                              const style = status ? STATUS_STYLE[status] : null;
                              const cellKey = `${emp.emp_code}-${dateStr}`;
                              return (
                                <td key={day} className="p-0.5 text-center border-b border-r border-gray-100 dark:border-gray-800">
                                  <button
                                    onClick={() => handleCellClick(emp.emp_code, day)}
                                    disabled={savingCell === cellKey}
                                    className={`h-6 w-full rounded text-[10px] font-bold transition ${style ? style.cls : "bg-gray-50 text-gray-300 hover:bg-gray-100 dark:bg-white/[0.03] dark:text-gray-600 dark:hover:bg-white/[0.06]"}`}
                                  >
                                    {savingCell === cellKey ? <Loader2 size={10} className="animate-spin mx-auto" /> : (style?.label || "—")}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
