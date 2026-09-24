import { useState, useMemo, useEffect } from "react";
import ExcelJS from "exceljs";
import {
  X,
  FileSpreadsheet,
  Upload,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Download,
  ArrowRight,
  RefreshCw,
  History,
  Search,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { adminUserApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";

const FIELD_OPTIONS = [
  { id: "mobile_number", label: "Mobile Number", key: "mobile_number", validation: "10 digits" },
  { id: "department", label: "Department", key: "department" },
  { id: "designation", label: "Designation", key: "designation" },
  { id: "unit", label: "Unit", key: "unit" },
  { id: "dob", label: "Date of Birth", key: "dob", validation: "YYYY-MM-DD" },
  { id: "gender", label: "Gender", key: "gender" },
  { id: "aadhar_card_no", label: "Aadhaar Card No", key: "aadhar_card_no", validation: "12 digits" },
  { id: "pan_card_no", label: "PAN Card No", key: "pan_card_no", validation: "FORMAT: ABCDE1234F" },
  { id: "bank_name", label: "Bank Name", key: "bank_name" },
  { id: "account_number", label: "Account Number", key: "account_number" },
  { id: "ifsc_code", label: "IFSC Code", key: "ifsc_code" },
  { id: "role", label: "Role", key: "role" },
];

const COMPANY_OPTIONS = [
  { label: "Nidhi Impex", value: "Nidhi Impex" },
  { label: "Silver Star", value: "Silver Star" },
];

export default function BulkProfileUpdateModal({
  isOpen,
  onClose,
  employees = [],
  onSuccess,
}) {
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState("update"); // "update" | "history"
  const [selectedCompany, setSelectedCompany] = useState("Nidhi Impex");
  const [selectedFields, setSelectedFields] = useState(["mobile_number"]);
  const [step, setStep] = useState(1); // 1: Setup & Upload, 2: Diff Preview, 3: Success
  const [diffResults, setDiffResults] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSummary, setSubmitSummary] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  // History state with lazy initializer
  const [updateHistory, setUpdateHistory] = useState(() => {
    try {
      const saved = localStorage.getItem("bulk_profile_update_history");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [expandedBatchId, setExpandedBatchId] = useState(null);
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  // Fetch history from database on modal open or tab switch
  useEffect(() => {
    if (!isOpen) return;
    const token = currentUser?.accessToken || localStorage.getItem("accessToken") || localStorage.getItem("token") || sessionStorage.getItem("accessToken");
    const tokenType = currentUser?.tokenType || "Bearer";
    if (!token) return;

    let cancelled = false;
    adminUserApi.bulkProfileUpdateHistory("", token, tokenType).then((res) => {
      if (cancelled) return;
      if (res && res.history && Array.isArray(res.history)) {
        setUpdateHistory(res.history);
        try {
          localStorage.setItem("bulk_profile_update_history", JSON.stringify(res.history));
        } catch {}
      }
    }).catch((err) => {
      console.warn("Could not fetch database update history, using local cache:", err);
    });

    return () => { cancelled = true; };
  }, [isOpen, currentUser]);

  // Adjust state during render when isOpen changes (React recommended pattern)
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setStep(1);
      setDiffResults([]);
      setErrorMessage("");
      setSubmitSummary(null);
      setSelectedCompany("Nidhi Impex");
      setActiveTab("update");
      try {
        const saved = localStorage.getItem("bulk_profile_update_history");
        if (saved) {
          setUpdateHistory(JSON.parse(saved));
        }
      } catch (e) {
        console.error("Failed to load history:", e);
      }
    }
  }

  const saveHistoryRecord = (record) => {
    try {
      const updated = [record, ...updateHistory].slice(0, 50);
      setUpdateHistory(updated);
      localStorage.setItem("bulk_profile_update_history", JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save history record:", e);
    }
  };

  // Normalize string for fuzzy company comparison
  const normStr = (str) => String(str || "").toLowerCase().replace(/[\s-_]+/g, "");

  const filteredEmployees = useMemo(() => {
    const target = normStr(selectedCompany || "Nidhi Impex");

    return employees.filter((e) => {
      const cLabel = normStr(e.companyLabel || e.company_name || e.company);
      const cId = normStr(e.companyId || e.company_code);
      if (!cLabel && !cId) return false;
      return (
        cLabel.includes(target) ||
        target.includes(cLabel) ||
        cId.includes(target) ||
        target.includes(cId) ||
        cLabel.includes("both") ||
        cId.includes("both") ||
        cLabel.includes("all") ||
        cId.includes("all")
      );
    });
  }, [employees, selectedCompany]);

  // Filter history records
  const filteredHistory = useMemo(() => {
    if (!historySearchQuery.trim()) return updateHistory;
    const q = historySearchQuery.toLowerCase();
    return updateHistory.filter((batch) => {
      return (
        batch.company.toLowerCase().includes(q) ||
        batch.actor.toLowerCase().includes(q) ||
        batch.changes.some(
          (c) => c.empCode.toLowerCase().includes(q) || c.empName.toLowerCase().includes(q)
        )
      );
    });
  }, [updateHistory, historySearchQuery]);

  if (!isOpen) return null;

  const toggleField = (fieldId) => {
    if (selectedFields.includes(fieldId)) {
      if (selectedFields.length > 1) {
        setSelectedFields(selectedFields.filter((f) => f !== fieldId));
      }
    } else {
      setSelectedFields([...selectedFields, fieldId]);
    }
  };

  const selectAllFields = () => {
    setSelectedFields(FIELD_OPTIONS.map((f) => f.id));
  };

  const clearAllFields = () => {
    setSelectedFields(["mobile_number"]);
  };

  // Helper to extract employee value
  const getEmpValue = (emp, fieldKey) => {
    if (!emp) return "";
    if (fieldKey === "mobile_number") {
      return emp.mobileNo || emp.mobile_number || emp.mobile_no || emp.mobile || "";
    }
    if (fieldKey === "department") {
      return emp.department || emp.department_name || "";
    }
    if (fieldKey === "designation") {
      return emp.positionTitle || emp.designation_name || emp.designation || emp.position || "";
    }
    if (fieldKey === "unit") {
      return emp.unit || emp.unit_name || "";
    }
    if (fieldKey === "company") {
      return emp.companyLabel || emp.company_name || emp.company || emp.companyId || "";
    }
    if (fieldKey === "dob") {
      return emp.dob || emp.date_of_birth || emp.birth_date || "";
    }
    if (fieldKey === "gender") {
      return emp.gender || "";
    }
    if (fieldKey === "aadhar_card_no") {
      return emp.aadharCardNo || emp.aadhar || emp.aadhar_card_no || emp.aadhaar || "";
    }
    if (fieldKey === "pan_card_no") {
      return emp.panCardNo || emp.pan || emp.pan_card_no || "";
    }
    if (fieldKey === "bank_name") {
      return emp.bankName || emp.bank_name || "";
    }
    if (fieldKey === "account_number") {
      return emp.bankAccountNo || emp.accountNo || emp.account_number || emp.account_no || "";
    }
    if (fieldKey === "ifsc_code") {
      return emp.bankIfscCode || emp.ifsc || emp.ifsc_code || "";
    }
    if (fieldKey === "role") {
      return emp.loginRole || emp.role || "";
    }
    return emp[fieldKey] !== null && emp[fieldKey] !== undefined ? String(emp[fieldKey]) : "";
  };

  const getEmpCode = (emp) => String(emp.empCode || emp.emp_code || "").trim();

  // Download Pre-filled Template
  const handleDownloadTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Bulk Update Template");

    const fieldCols = FIELD_OPTIONS.filter((f) => selectedFields.includes(f.id));
    const columns = [
      { header: "EMP CODE", key: "emp_code", width: 15 },
      { header: "EMPLOYEE NAME", key: "name", width: 25 },
      { header: "COMPANY", key: "company", width: 20 },
      ...fieldCols.map((col) => ({
        header: `${col.label.toUpperCase()}${col.validation ? ` (${col.validation})` : ""}`,
        key: col.id,
        width: 22,
      })),
    ];

    worksheet.columns = columns;

    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFF" } };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "4F46E5" },
    };

    filteredEmployees.forEach((emp) => {
      const rowData = {
        emp_code: getEmpCode(emp),
        name: emp.name || emp.displayName || `${emp.first_name || ""} ${emp.last_name || ""}`.trim(),
        company: getEmpValue(emp, "company"),
      };

      fieldCols.forEach((col) => {
        rowData[col.id] = getEmpValue(emp, col.key);
      });

      worksheet.addRow(rowData);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Bulk_Update_${selectedCompany.replace(/\s+/g, "_")}_${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Validation logic for field values
  const validateFieldValue = (fieldKey, value) => {
    if (!value || String(value).trim() === "") return { isValid: true, error: "" };
    const strVal = String(value).trim();

    if (fieldKey === "mobile_number") {
      const cleanMobile = strVal.replace(/\D/g, "");
      if (cleanMobile.length !== 10) {
        return { isValid: false, error: "Mobile number must be exactly 10 digits" };
      }
    } else if (fieldKey === "aadhar_card_no") {
      const cleanAadhaar = strVal.replace(/\D/g, "");
      if (cleanAadhaar.length !== 12) {
        return { isValid: false, error: "Aadhaar number must be exactly 12 digits" };
      }
    } else if (fieldKey === "pan_card_no") {
      const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i;
      if (!panRegex.test(strVal)) {
        return { isValid: false, error: "Invalid PAN format (e.g. ABCDE1234F)" };
      }
    } else if (fieldKey === "dob") {
      if (isNaN(Date.parse(strVal))) {
        return { isValid: false, error: "Invalid Date format (Use YYYY-MM-DD)" };
      }
    }
    return { isValid: true, error: "" };
  };

  // Clean value normalization for change detection
  const normalizeVal = (val) => {
    if (val === null || val === undefined) return "";
    const str = String(val).trim();
    if (str === "0" || str === "-" || str === "N/A" || str === "null" || str === "undefined") return "";
    return str;
  };

  // Header matching helper for Excel columns
  const matchFieldToHeader = (headerLabel, field) => {
    const clean = headerLabel.split("(")[0].trim().toUpperCase().replace(/[\s-_]+/g, "");
    const fId = field.id.toUpperCase().replace(/[\s-_]+/g, "");
    const fLabel = field.label.toUpperCase().replace(/[\s-_]+/g, "");
    const fKey = field.key.toUpperCase().replace(/[\s-_]+/g, "");

    if (clean === fId || clean === fLabel || clean === fKey) return true;
    if (field.id === "mobile_number" && (clean === "MOBILE" || clean === "MOBILENO" || clean === "MOBILENUMBER" || clean === "PHONE")) return true;
    if (field.id === "aadhar_card_no" && (clean === "AADHAAR" || clean === "AADHAARNO" || clean === "AADHAARCARD" || clean === "AADHAR")) return true;
    if (field.id === "pan_card_no" && (clean === "PAN" || clean === "PANNO" || clean === "PANCARD")) return true;
    if (field.id === "account_number" && (clean === "ACCOUNTNO" || clean === "BANKACCOUNTNO" || clean === "ACCOUNT")) return true;
    if (field.id === "ifsc_code" && (clean === "IFSC" || clean === "IFSCCODE" || clean === "BANKIFSC")) return true;
    if (field.id === "dob" && (clean === "DOB" || clean === "DATEOFBIRTH" || clean === "BIRTHDATE")) return true;
    return false;
  };

  // File Upload & Diff Parsing
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setErrorMessage("");
    try {
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        setErrorMessage("The uploaded excel file is empty.");
        return;
      }

      const headerRow = worksheet.getRow(1);
      const headersMap = {};
      headerRow.eachCell((cell, colNumber) => {
        const headerText = String(cell.value || "").trim().toUpperCase();
        headersMap[colNumber] = headerText;
      });

      let empCodeCol = null;
      let empNameCol = null;

      Object.entries(headersMap).forEach(([colIdx, label]) => {
        const cleanLabel = label.split("(")[0].trim();
        if (cleanLabel.includes("EMP CODE") || cleanLabel.includes("EMPLOYEE CODE") || cleanLabel === "CODE") {
          empCodeCol = colIdx;
        }
        if (cleanLabel.includes("NAME") && !cleanLabel.includes("BANK")) {
          empNameCol = colIdx;
        }
      });

      if (!empCodeCol) {
        setErrorMessage("Excel file must contain an 'EMP CODE' column in header.");
        return;
      }

      const fieldColsMap = [];
      FIELD_OPTIONS.forEach((field) => {
        Object.entries(headersMap).forEach(([colIdx, label]) => {
          if (matchFieldToHeader(label, field)) {
            fieldColsMap.push({
              colIdx,
              fieldId: field.id,
              fieldLabel: field.label,
              fieldKey: field.key,
            });
          }
        });
      });

      if (fieldColsMap.length === 0) {
        setErrorMessage("No matching editable columns found in Excel. Please download and use template.");
        return;
      }

      const empLookup = {};
      employees.forEach((emp) => {
        const code = getEmpCode(emp);
        if (code) {
          const cleanCode = code.toLowerCase();
          const noZeroCode = cleanCode.replace(/^0+/, "");
          empLookup[cleanCode] = emp;
          if (noZeroCode) empLookup[noZeroCode] = emp;
        }
      });

      const parsedDiffs = [];

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        let rawCode = row.getCell(Number(empCodeCol)).value;
        if (rawCode && typeof rawCode === "object") {
          rawCode = rawCode.result ?? rawCode.text ?? rawCode.value ?? rawCode;
        }
        if (rawCode === null || rawCode === undefined || String(rawCode).trim() === "") return;

        const empCodeStr = String(rawCode).trim();
        const empCodeLookupKey = empCodeStr.toLowerCase();
        const empCodeNoZeroKey = empCodeLookupKey.replace(/^0+/, "");

        const matchedEmp = empLookup[empCodeLookupKey] || empLookup[empCodeNoZeroKey];

        if (!matchedEmp) {
          parsedDiffs.push({
            id: `row-${rowNumber}-notfound`,
            empCode: empCodeStr,
            empName: empNameCol ? String(row.getCell(Number(empNameCol)).value || "") : "Unknown",
            fieldId: "-",
            fieldLabel: "Employee Lookup",
            oldValue: "-",
            newValue: "-",
            status: "EMP_NOT_FOUND",
            error: "Employee code not found in active database",
            matchedEmp: null,
          });
          return;
        }

        fieldColsMap.forEach((fCol) => {
          let cellVal = row.getCell(Number(fCol.colIdx)).value;
          if (cellVal && typeof cellVal === "object") {
            if (cellVal.result !== undefined) cellVal = cellVal.result;
            else if (cellVal.text !== undefined) cellVal = cellVal.text;
            else if (cellVal instanceof Date) {
              cellVal = cellVal.toISOString().slice(0, 10);
            }
          }

          const rawCellStr = cellVal !== null && cellVal !== undefined ? String(cellVal).trim() : "";
          const rawOldStr = getEmpValue(matchedEmp, fCol.fieldKey);

          const newNorm = normalizeVal(rawCellStr);
          const oldNorm = normalizeVal(rawOldStr);

          const isChanged = newNorm !== oldNorm;

          if (isChanged) {
            const validationResult = validateFieldValue(fCol.fieldKey, rawCellStr);
            parsedDiffs.push({
              id: `row-${rowNumber}-${fCol.fieldId}`,
              empCode: getEmpCode(matchedEmp),
              empName: matchedEmp.name || matchedEmp.displayName || `${matchedEmp.first_name || ""} ${matchedEmp.last_name || ""}`.trim(),
              fieldId: fCol.fieldId,
              fieldLabel: fCol.fieldLabel,
              fieldKey: fCol.fieldKey,
              oldValue: rawOldStr !== "" ? rawOldStr : "(Empty)",
              newValue: rawCellStr !== "" ? rawCellStr : "(Cleared)",
              status: validationResult.isValid ? "VALID" : "INVALID",
              error: validationResult.error,
              matchedEmp,
            });
          }
        });
      });

      if (parsedDiffs.length === 0) {
        setErrorMessage("No profile data changes were detected in the uploaded spreadsheet compared to existing records. (All records match current database)");
        return;
      }

      setDiffResults(parsedDiffs);
      setStep(2);
    } catch (err) {
      console.error("Excel parse error:", err);
      setErrorMessage("Failed to read Excel file. Please ensure it is a valid .xlsx file.");
    }
  };

  const validDiffs = diffResults.filter((d) => d.status === "VALID");
  const invalidDiffs = diffResults.filter((d) => d.status === "INVALID");
  const notFoundDiffs = diffResults.filter((d) => d.status === "EMP_NOT_FOUND");

  // Submit Bulk Update with Auth token & record to audit history
  const handleApplyUpdates = async () => {
    if (validDiffs.length === 0) return;

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const accessToken =
        currentUser?.accessToken ||
        localStorage.getItem("accessToken") ||
        localStorage.getItem("token") ||
        sessionStorage.getItem("accessToken");

      const tokenType = currentUser?.tokenType || "Bearer";

      if (!accessToken) {
        setErrorMessage("Authorization Token not found. Please refresh or re-login.");
        setIsSubmitting(false);
        return;
      }

      const updatesMap = {};
      validDiffs.forEach((diff) => {
        if (!updatesMap[diff.empCode]) {
          updatesMap[diff.empCode] = {
            emp_code: diff.empCode,
            fields: {},
          };
        }
        updatesMap[diff.empCode].fields[diff.fieldKey] = diff.newValue === "(Cleared)" ? "" : diff.newValue;
      });

      const updatesArray = Object.values(updatesMap);

      const changesList = validDiffs.map((d) => ({
        empCode: d.empCode,
        empName: d.empName,
        fieldLabel: d.fieldLabel,
        oldValue: d.oldValue,
        newValue: d.newValue,
      }));

      const res = await adminUserApi.bulkProfileUpdate(
        { updates: updatesArray, company_code: selectedCompany, changes: changesList },
        accessToken,
        tokenType
      );

      if (res && (res.status === "success" || res.updated_count !== undefined)) {
        const summary = {
          updatedEmployees: res.updated_count || Object.keys(updatesMap).length,
          totalFieldsUpdated: validDiffs.length,
          skippedErrors: invalidDiffs.length + notFoundDiffs.length,
        };

        setSubmitSummary(summary);

        // Record history log item
        const historyRecord = {
          id: `batch-${Date.now()}`,
          timestamp: new Date().toISOString(),
          company: selectedCompany,
          actor: currentUser?.name || currentUser?.username || "Admin",
          updatedEmployees: summary.updatedEmployees,
          totalFieldsUpdated: summary.totalFieldsUpdated,
          changes: validDiffs.map((d) => ({
            empCode: d.empCode,
            empName: d.empName,
            fieldLabel: d.fieldLabel,
            oldValue: d.oldValue,
            newValue: d.newValue,
          })),
        };

        saveHistoryRecord(historyRecord);

        setStep(3);
        if (onSuccess) onSuccess();
      } else {
        setErrorMessage(res?.message || "Failed to complete bulk update.");
      }
    } catch (err) {
      console.error("Bulk profile update submit error:", err);
      setErrorMessage(err.message || "An error occurred while communicating with the server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetModal = () => {
    setStep(1);
    setDiffResults([]);
    setErrorMessage("");
    setSubmitSummary(null);
  };

  const exportHistoryBatchToExcel = async (batch) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Bulk Update Log");

    worksheet.columns = [
      { header: "EMP CODE", key: "empCode", width: 15 },
      { header: "EMPLOYEE NAME", key: "empName", width: 25 },
      { header: "FIELD CHANGED", key: "fieldLabel", width: 20 },
      { header: "OLD VALUE", key: "oldValue", width: 20 },
      { header: "NEW VALUE", key: "newValue", width: 20 },
      { header: "UPDATE TIMESTAMP", key: "timestamp", width: 25 },
      { header: "UPDATED BY", key: "actor", width: 20 },
    ];

    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFF" } };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "4F46E5" },
    };

    batch.changes.forEach((c) => {
      worksheet.addRow({
        empCode: c.empCode,
        empName: c.empName,
        fieldLabel: c.fieldLabel,
        oldValue: c.oldValue,
        newValue: c.newValue,
        timestamp: new Date(batch.timestamp).toLocaleString(),
        actor: batch.actor,
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Bulk_Update_Log_${batch.id}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden my-8 transition-all">
        {/* Modal Header & Tabs */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Update Bulk Employee Profiles
              </h2>
              <div className="flex items-center gap-4 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("update");
                    setStep(1);
                  }}
                  className={`text-xs font-semibold pb-0.5 border-b-2 transition-all ${
                    activeTab === "update"
                      ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                      : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  {step === 1 && "Step 1: Select Company, Fields & Template"}
                  {step === 2 && "Step 2: Preview Changes & Rule Validation"}
                  {step === 3 && "Step 3: Update Complete"}
                </button>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <button
                  type="button"
                  onClick={() => setActiveTab("history")}
                  className={`text-xs font-semibold pb-0.5 border-b-2 flex items-center gap-1.5 transition-all ${
                    activeTab === "history"
                      ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                      : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  <History className="w-3.5 h-3.5" /> View Update History ({updateHistory.length})
                </button>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {errorMessage && (
            <div className="mb-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 text-amber-700 dark:text-amber-300 text-xs font-medium">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>{errorMessage}</div>
            </div>
          )}

          {/* TAB 1: NEW BULK UPDATE */}
          {activeTab === "update" && (
            <>
              {/* STEP 1: OPTIONS & TEMPLATE & UPLOAD */}
              {step === 1 && (
                <div className="space-y-6">
                  {/* Company Selection - STRICTLY NIDHI IMPEX & SILVER STAR ONLY */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                      1. Select Target Company
                    </label>
                    <select
                      value={selectedCompany}
                      onChange={(e) => setSelectedCompany(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      {COMPANY_OPTIONS.map((c) => {
                        const target = normStr(c.value);
                        const count = employees.filter((e) => {
                          const cLabel = normStr(e.companyLabel || e.company_name || e.company);
                          const cId = normStr(e.companyId || e.company_code);
                          return (
                            cLabel.includes(target) ||
                            target.includes(cLabel) ||
                            cId.includes(target) ||
                            target.includes(cId) ||
                            cLabel.includes("both") ||
                            cId.includes("both") ||
                            cLabel.includes("all") ||
                            cId.includes("all")
                          );
                        }).length;
                        return (
                          <option key={c.value} value={c.value}>
                            {c.label} ({count} Employees)
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Field Selection */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                        2. Choose Fields to Include in Template ({selectedFields.length} selected)
                      </label>
                      <div className="flex items-center gap-3 text-xs">
                        <button
                          type="button"
                          onClick={selectAllFields}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                        >
                          Select All
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={clearAllFields}
                          className="text-slate-500 hover:underline font-medium"
                        >
                          Reset
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                      {FIELD_OPTIONS.map((field) => {
                        const isChecked = selectedFields.includes(field.id);
                        return (
                          <label
                            key={field.id}
                            className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs font-medium cursor-pointer transition-all ${
                              isChecked
                                ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500/40 text-indigo-700 dark:text-indigo-300 shadow-sm"
                                : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleField(field.id)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="truncate">{field.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Action Cards: Download & Upload */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    {/* Download Template Card */}
                    <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-50/50 to-blue-50/30 dark:from-indigo-950/20 dark:to-slate-800/50 border border-indigo-100 dark:border-indigo-900/30 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold text-sm mb-1">
                          <Download className="w-4 h-4" />
                          Step A: Download Pre-filled Template
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                          Get an Excel file pre-populated with {filteredEmployees.length} employees and selected field data. Edit directly in Excel.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleDownloadTemplate}
                        className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        Download {selectedCompany} Template (.xlsx)
                      </button>
                    </div>

                    {/* Upload Modified Excel Card */}
                    <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50/50 to-teal-50/30 dark:from-emerald-950/20 dark:to-slate-800/50 border border-emerald-100 dark:border-emerald-900/30 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-sm mb-1">
                          <Upload className="w-4 h-4" />
                          Step B: Upload Updated Sheet
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                          Upload the modified Excel spreadsheet to automatically compare changes & validate formatting.
                        </p>
                      </div>

                      <label className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-colors">
                        <Upload className="w-4 h-4" />
                        Upload Updated Excel File
                        <input
                          type="file"
                          accept=".xlsx, .xls, .csv"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: DIFF PREVIEW & VALIDATION RESULTS */}
              {step === 2 && (
                <div className="space-y-4">
                  {/* Summary Header Badges */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Changed Fields</div>
                      <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                        {diffResults.length}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                        Valid & Ready
                      </div>
                      <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                        {validDiffs.length}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                      <div className="text-xs text-rose-700 dark:text-rose-400 font-medium">Validation Errors</div>
                      <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                        {invalidDiffs.length}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <div className="text-xs text-amber-700 dark:text-amber-400 font-medium">Emp Not Found</div>
                      <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                        {notFoundDiffs.length}
                      </div>
                    </div>
                  </div>

                  {invalidDiffs.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs text-amber-800 dark:text-amber-300">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <span>
                          {invalidDiffs.length} item(s) failed rule validation. Only <strong>{validDiffs.length} valid change(s)</strong> will be updated in database.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Diff Table (ONLY CHANGED ITEMS) */}
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="p-3">Status</th>
                          <th className="p-3">Emp Code</th>
                          <th className="p-3">Employee Name</th>
                          <th className="p-3">Field</th>
                          <th className="p-3">Old Value</th>
                          <th className="p-3">New Value</th>
                          <th className="p-3">Validation Note</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300">
                        {diffResults.map((item) => {
                          return (
                            <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                              <td className="p-3 whitespace-nowrap">
                                {item.status === "VALID" && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                                    <CheckCircle2 className="w-3 h-3" /> Valid
                                  </span>
                                )}
                                {item.status === "INVALID" && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-medium">
                                    <AlertCircle className="w-3 h-3" /> Invalid
                                  </span>
                                )}
                                {item.status === "EMP_NOT_FOUND" && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-600 dark:text-slate-400 font-medium">
                                    <AlertTriangle className="w-3 h-3" /> Not Found
                                  </span>
                                )}
                              </td>
                              <td className="p-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                                {item.empCode}
                              </td>
                              <td className="p-3 font-medium">{item.empName}</td>
                              <td className="p-3 font-medium text-indigo-600 dark:text-indigo-400">
                                {item.fieldLabel}
                              </td>
                              <td className="p-3 text-slate-500 dark:text-slate-400">
                                {item.oldValue}
                              </td>
                              <td className="p-3 font-semibold text-slate-900 dark:text-slate-100 bg-indigo-50/30 dark:bg-indigo-950/20">
                                {item.newValue}
                              </td>
                              <td className="p-3 text-slate-500 dark:text-slate-400">
                                {item.error ? (
                                  <span className="text-rose-600 dark:text-rose-400 font-medium">
                                    {item.error}
                                  </span>
                                ) : (
                                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                    Passed Validation
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Footer controls for Step 2 */}
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={handleResetModal}
                      className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium transition-colors"
                    >
                      Back to Options
                    </button>

                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500">
                        Ready to update: <strong>{validDiffs.length} records</strong>
                      </span>
                      <button
                        type="button"
                        onClick={handleApplyUpdates}
                        disabled={validDiffs.length === 0 || isSubmitting}
                        className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium text-xs flex items-center gap-2 shadow-md transition-all"
                      >
                        {isSubmitting ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" /> Updating Database...
                          </>
                        ) : (
                          <>
                            Apply Bulk Updates ({validDiffs.length}) <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: SUCCESS RESULT */}
              {step === 3 && submitSummary && (
                <div className="py-8 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>

                  <div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                      Bulk Profile Update Successful!
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Updated profiles for {submitSummary.updatedEmployees} employee(s) across {submitSummary.totalFieldsUpdated} total field entries.
                    </p>
                  </div>

                  {submitSummary.skippedErrors > 0 && (
                    <div className="max-w-md mx-auto p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-400">
                      Note: {submitSummary.skippedErrors} invalid/missing row(s) were safely skipped without modifying the database.
                    </div>
                  )}

                  <div className="pt-4 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab("history");
                      }}
                      className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors"
                    >
                      <History className="w-4 h-4" /> View Update Log History
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleResetModal();
                        onClose();
                      }}
                      className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md transition-colors"
                    >
                      Done & Close
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* TAB 2: UPDATE HISTORY LOG */}
          {activeTab === "history" && (
            <div className="space-y-4">
              {/* History Search Bar */}
              <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search past updates by Employee Code, Name, Company..."
                    value={historySearchQuery}
                    onChange={(e) => setHistorySearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div className="text-xs text-slate-500 font-medium whitespace-nowrap">
                  Total Batches: <strong>{filteredHistory.length}</strong>
                </div>
              </div>

              {/* History List */}
              {filteredHistory.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                  <History className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  No bulk profile update history records found.
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {filteredHistory.map((batch) => {
                    const isExpanded = expandedBatchId === batch.id;
                    return (
                      <div
                        key={batch.id}
                        className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 transition-all shadow-sm"
                      >
                        {/* Batch Header Row */}
                        <div
                          onClick={() => setExpandedBatchId(isExpanded ? null : batch.id)}
                          className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                              {new Date(batch.timestamp).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                <span>Bulk Update ({batch.company})</span>
                                <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                  {new Date(batch.timestamp).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-3">
                                <span>Updated by: <strong>{batch.actor}</strong></span>
                                <span>•</span>
                                <span><strong>{batch.updatedEmployees}</strong> Employee(s)</span>
                                <span>•</span>
                                <span><strong>{batch.totalFieldsUpdated}</strong> Total Fields Changed</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                exportHistoryBatchToExcel(batch);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 text-[11px] font-medium flex items-center gap-1.5 transition-colors"
                              title="Export this batch log to Excel"
                            >
                              <Download className="w-3.5 h-3.5" /> Export Log
                            </button>

                            <div className="text-slate-400">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </div>
                          </div>
                        </div>

                        {/* Batch Expanded Table Details */}
                        {isExpanded && (
                          <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-3">
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <thead>
                                  <tr className="text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 pb-2">
                                    <th className="p-2">Emp Code</th>
                                    <th className="p-2">Employee Name</th>
                                    <th className="p-2">Field Changed</th>
                                    <th className="p-2">Old Value</th>
                                    <th className="p-2">New Value</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                                  {batch.changes.map((c, idx) => (
                                    <tr key={`${batch.id}-${idx}`} className="hover:bg-white dark:hover:bg-slate-800/50">
                                      <td className="p-2 font-mono font-medium text-slate-900 dark:text-slate-100">
                                        {c.empCode}
                                      </td>
                                      <td className="p-2 font-medium">{c.empName}</td>
                                      <td className="p-2 font-semibold text-indigo-600 dark:text-indigo-400">
                                        {c.fieldLabel}
                                      </td>
                                      <td className="p-2 text-slate-500 dark:text-slate-400">
                                        {c.oldValue}
                                      </td>
                                      <td className="p-2 font-bold text-emerald-600 dark:text-emerald-400">
                                        {c.newValue}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
