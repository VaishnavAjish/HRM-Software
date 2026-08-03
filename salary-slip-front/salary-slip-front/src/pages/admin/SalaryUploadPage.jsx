import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Building2,
  Download,
  DollarSign,
  Upload,
  CloudUpload,
} from "lucide-react";
import * as XLSX from "xlsx";
import Button from "../../components/ui/Button";
import { salaryApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { getCompanyConfig, COMPANY_OPTIONS } from "../../config/companyConfig";
import UploadBatchPanel from "../../components/admin/UploadBatchPanel";
import BulkSalaryValidation from "../../components/admin/BulkSalaryValidation";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const YEARS = ["2024", "2025", "2026", "2027", "2028", "2029", "2030"];

export default function SalaryUploadPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { companyId, activeUnit, isAllCompanies } = useCompany();

  // Template config options
  const [selectedCompanyId, setSelectedCompanyId] = useState(companyId !== "all" ? companyId : "");
  const [selectedUnit, setSelectedUnit] = useState(activeUnit || "");
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1)); // 1-indexed
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

  // File Upload State
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [reloadCounter, setReloadCounter] = useState(0);
  const [justUploadedBatchId, setJustUploadedBatchId] = useState(null);
  const [showValidation, setShowValidation] = useState(false);

  const fileInputRef = useRef(null);

  const activeCompanyConfig = getCompanyConfig(selectedCompanyId);
  const unitOptions = activeCompanyConfig ? activeCompanyConfig.units : [];

  // Download template logic
  const downloadTemplate = async () => {
    if (!selectedCompanyId) {
      toast.error("Please select a company to download the template.");
      return;
    }

    const template = getCompanyConfig(selectedCompanyId)?.salaryUploadTemplate;
    if (!template) {
      toast.error("Template headers not configured for this company.");
      return;
    }

    const headers = template.headers ?? [];
    const monthCol = headers.indexOf("Month");
    const yearCol = headers.indexOf("Year");
    const codeCol = headers.indexOf("Employee Code");
    const nameCol = headers.indexOf("Employee Name");

    let rows = [];
    setTemplateLoading(true);
    try {
      const res = await salaryApi.getAllEmployees(
        user?.accessToken,
        user?.tokenType,
        // Without an explicit limit the backend paginates at 15
        // (UserController::index), so the template silently dropped every
        // employee past the first page instead of listing them all.
        { limit: 1000 },
        { companyId: selectedCompanyId, unit: selectedUnit }
      );
      const employees = res?.data?.users?.data ?? res?.data?.users ?? [];
      
      rows = employees.map((emp) => {
        const row = Array(headers.length).fill("");
        if (monthCol !== -1) row[monthCol] = selectedMonth;
        if (yearCol !== -1) row[yearCol] = selectedYear;
        if (codeCol !== -1) row[codeCol] = emp.emp_code ?? "";
        if (nameCol !== -1) row[nameCol] = emp.name ?? "";
        return row;
      });
    } catch (err) {
      toast.error(err.message || "Failed to load employees for template");
    } finally {
      setTemplateLoading(false);
    }

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, template.sheetName || "Salary Slip");
    
    const formattedMonth = MONTHS[parseInt(selectedMonth, 10) - 1].toLowerCase();
    const fileName = `${selectedCompanyId}_salary_${formattedMonth}_${selectedYear}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success("Template downloaded successfully");
  };

  // Excel parsing for preview
  const parseExcelPreview = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const allRows = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: "",
          });
          const [headerRow = [], ...dataRows] = allRows;
          resolve({
            sheetName,
            headers: headerRow.map(String),
            rows: dataRows,
            totalRows: dataRows.length,
          });
        } catch {
          reject(new Error("Could not read file. Make sure it is a valid Excel file."));
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.readAsArrayBuffer(file);
    });
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
    setSelectedFile(file);
    try {
      const data = await parseExcelPreview(file);
      setUploadPreview(data);
      setShowValidation(true);
    } catch (err) {
      toast.error(err.message);
      setSelectedFile(null);
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
    setSelectedFile(null);
    setUploadPreview(null);
    setShowValidation(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Rows may have been hand-edited or had bad rows deleted in the validation
  // step, so the sheet actually sent to the backend is rebuilt from that
  // final data rather than re-uploading the original file untouched.
  const buildFileFromRows = (headers, dataRows) => {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, uploadPreview?.sheetName || "Salary Slip");
    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    return new File([buffer], selectedFile?.name || "salary_upload.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  };

  const handleValidationConfirm = async (finalRows) => {
    if (!selectedCompanyId) {
      toast.error("Select a company first.");
      return;
    }

    setUploading(true);
    try {
      const fileToUpload = buildFileFromRows(uploadPreview.headers, finalRows);
      const res = await salaryApi.uploadSalarySlip(
        fileToUpload,
        user?.accessToken,
        user?.tokenType,
        selectedCompanyId,
        selectedUnit
      );

      const skipped = res?.skipped ?? [];
      const okCount = res?.imported ?? 0;
      const skipCount = skipped.length;

      /*
       * The server explains every skipped row — "Row 2: Missing employee code",
       * "Row 5: Unrecognized month value" — and that detail used to be thrown
       * away in favour of a fixed "due to missing fields", which was wrong for
       * every other cause and sent people looking in the wrong place. Summarise
       * the distinct reasons instead; the per-row breakdown is still in the
       * upload report.
       */
      const reasons = [
        ...new Set(
          skipped
            .map((entry) => String(entry).replace(/^Row\s+\d+:\s*/i, "").trim())
            .filter(Boolean),
        ),
      ];
      const detail = reasons.length ? ` — ${reasons.join("; ")}` : "";
      const rowWord = (n) => `${n} row${n === 1 ? "" : "s"}`;

      if (skipCount === 0) {
        toast.success(`Successfully uploaded ${okCount} salary slip${okCount === 1 ? "" : "s"}.`);
      } else if (okCount === 0) {
        // Nothing was written at all. This used to show a green tick reading
        // "Uploaded 0 records", so a completely failed upload looked like it
        // had worked.
        toast.error(`No salary slips uploaded — ${rowWord(skipCount)} skipped${detail}`);
      } else {
        toast(`Uploaded ${okCount}, skipped ${rowWord(skipCount)}${detail}`, {
          icon: "⚠️",
        });
      }

      clearFile();
      setReloadCounter((prev) => prev + 1);
      if (res?.batch_id) setJustUploadedBatchId(res.batch_id);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col xl:flex-row gap-6 p-2 lg:p-6 min-h-[calc(100vh-80px)] bg-transparent">
      
      {/* Left Column: Recent Upload Batch Data */}
      <div className="w-full xl:w-96 flex-shrink-0 flex flex-col gap-4">
        <UploadBatchPanel
          type="salary"
          icon={DollarSign}
          refreshKey={reloadCounter}
          companyId={selectedCompanyId || companyId}
          autoOpenBatchId={justUploadedBatchId}
        />
      </div>

      {/* Right Column: Template Options & Upload Zone */}
      <div className="flex-1 flex flex-col bg-white dark:bg-[#0b0f1a] rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm overflow-hidden h-[85vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5 dark:border-white/10 shrink-0">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400">
              <CloudUpload size={17} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Salary Slip Excel Upload
              </h2>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Download a custom template with employee details pre-filled, or upload your salary file
              </p>
            </div>
          </div>
        </div>

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
          {/* Options Card */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-white/10 dark:bg-white/[0.03]">
            <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400 mb-4">
              <Building2 size={13} /> Selection Options
            </h4>
            
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400">
                  Company Name <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setSelectedCompanyId(nextId);
                    const nextConf = getCompanyConfig(nextId);
                    if (nextConf && !nextConf.units.includes(selectedUnit)) {
                      setSelectedUnit("");
                    } else if (!nextConf) {
                      setSelectedUnit("");
                    }
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
                  Select Month
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
                  Select Year
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
                disabled={templateLoading || !selectedCompanyId}
              >
                {templateLoading ? "Generating..." : "Download Excel Template"}
              </Button>
            </div>
          </div>

          {/* Upload drop zone / validation */}
          {showValidation && uploadPreview ? (
            <BulkSalaryValidation
              headers={uploadPreview.headers}
              rawRows={uploadPreview.rows}
              onConfirm={handleValidationConfirm}
              onCancel={clearFile}
              uploading={uploading}
            />
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition ${
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
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400 mb-4">
                <Upload size={20} />
              </div>
              <p className="text-sm font-semibold text-gray-700 dark:text-slate-200">
                Drag and drop your Excel file here, or <span className="text-brand-600">browse</span>
              </p>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                Only Excel files (.xlsx, .xls) under 10MB are supported
              </p>
            </div>
          )}
        </div>

        {/* Footer — the validation step has its own Back/Upload footer */}
        {!showValidation && (
          <div className="flex items-center justify-between gap-4 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-white/10 dark:bg-white/[0.02] shrink-0">
            <div className="ml-auto flex flex-wrap justify-end gap-3">
              <Button variant="secondary" onClick={() => navigate("/admin/salary")}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
