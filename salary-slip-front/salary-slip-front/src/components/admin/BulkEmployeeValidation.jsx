import { useState, useMemo, useRef, useCallback } from "react";
import { CheckCircle2, XCircle, Trash2, Upload, Table2 } from "lucide-react";
import toast from "react-hot-toast";
import Button from "../ui/Button";
import Modal from "../ui/Modal";

function buildRowData(rowValues, columnMappings) {
  const mapped = {};
  Object.entries(columnMappings).forEach(([colIndex, dbField]) => {
    if (dbField) {
      mapped[dbField] = rowValues[Number(colIndex)] ?? "";
    }
  });
  return mapped;
}

function normalize(v) {
  return String(v || "").trim().toLowerCase();
}

const FIELD_LABELS = {
  emp_code: "Employee Code",
  name: "Full Name",
  email: "Email",
  mobile_number: "Mobile Number",
  department: "Department",
  designation: "Designation",
  company_code: "Company",
  unit: "Branch/Unit",
  dob: "Date of Birth",
  gender: "Gender",
  salary: "Salary",
  joining_date: "Joining Date",
  address: "Address",
  bank_name: "Bank Name",
  bank_account_no: "Bank Account No",
  bank_ifsc_code: "Bank IFSC Code",
  aadhar_card_no: "Aadhaar Card No",
  pan_card_no: "PAN Card No",
  pf_no: "PF Number",
  esi_no: "ESI Number",
  city: "City",
  district: "District",
  state: "State",
  pin: "PIN Code",
};

function fieldLabel(key) {
  return FIELD_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default function BulkEmployeeValidation({
  rawRows,
  columnMappings,
  onConfirm,
  onCancel,
  uploading = false,
}) {
  const [rows, setRows] = useState(() =>
    rawRows.map((rowValues, idx) => {
      const data = buildRowData(rowValues, columnMappings);
      return { id: idx, originalIndex: idx, data, deleted: false };
    })
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const editRef = useRef(null);

  const validateRow = useCallback((row) => {
    const errors = [];
    const empCode = normalize(row.data.emp_code);
    if (!empCode) {
      errors.push("Employee code is required");
    }
    const duplicateCodeInFile = rows.filter(
      (r) => !r.deleted && r.id !== row.id && normalize(r.data.emp_code) === empCode
    );
    if (empCode && duplicateCodeInFile.length > 0) {
      errors.push("Duplicate employee code within file");
    }

    const email = normalize(row.data.email);
    const duplicateEmailInFile = rows.filter(
      (r) => !r.deleted && r.id !== row.id && normalize(r.data.email) === email
    );
    if (email && duplicateEmailInFile.length > 0) {
      errors.push("Duplicate email within file");
    }
    return errors;
  }, [rows]);

  const validatedRows = useMemo(() => {
    const mapped = rows.filter(r => !r.deleted).map(r => ({
      ...r,
      errors: validateRow(r),
      isValid: validateRow(r).length === 0,
    }));
    const valid = mapped.filter(r => r.isValid);
    const invalid = mapped.filter(r => !r.isValid);
    return { all: [...valid, ...invalid], valid, invalid };
  }, [rows, validateRow]);

  const headerFields = useMemo(() => {
    const keys = Object.keys(columnMappings).sort((a, b) => Number(a) - Number(b));
    return keys.map(k => columnMappings[k]).filter(Boolean);
  }, [columnMappings]);

  function openEdit(rowId, field) {
    setEditing({ rowId, field });
  }

  function saveEdit() {
    if (!editing || !editRef.current) { setEditing(null); return; }
    const { rowId, field } = editing;
    const val = editRef.current.value;
    if (field === "emp_code" && !normalize(val)) {
      toast.error("Employee code cannot be empty");
      setEditing(null);
      return;
    }
    setRows(prev => prev.map(r =>
      r.id === rowId ? { ...r, data: { ...r.data, [field]: val } } : r
    ));
    setEditing(null);
  }

  function deleteRow(id) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, deleted: true } : r));
  }

  function handleConfirm() {
    if (uploading) return;
    const validData = validatedRows.valid.map(r => ({ ...r.data }));
    if (validData.length === 0) {
      toast.error("No valid rows to upload");
      return;
    }
    onConfirm(validData);
  }

  const isEditing = (rowId, field) =>
    editing?.rowId === rowId && editing?.field === field;

  function fieldErrorReason(field, row) {
    if (field === "emp_code") {
      return row.errors.find(e => e.toLowerCase().includes("employee code"));
    }
    if (field === "email") {
      return row.errors.find(e => e.toLowerCase().includes("email"));
    }
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          <div className="rounded-xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/15 px-3 py-2.5 text-center">
            <div className="flex items-center justify-center gap-1 mb-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={13} />
              <span className="text-[10px] font-semibold uppercase tracking-wide">Valid</span>
            </div>
            <p className="text-base font-bold text-gray-800 dark:text-white leading-none">{validatedRows.valid.length}</p>
          </div>
          <div className="rounded-xl border border-red-100 dark:border-red-900/40 bg-red-50 dark:bg-red-900/15 px-3 py-2.5 text-center">
            <div className="flex items-center justify-center gap-1 mb-1 text-red-600 dark:text-red-400">
              <XCircle size={13} />
              <span className="text-[10px] font-semibold uppercase tracking-wide">Invalid</span>
            </div>
            <p className="text-base font-bold text-gray-800 dark:text-white leading-none">{validatedRows.invalid.length}</p>
          </div>
          <div className="rounded-xl border border-brand-100 dark:border-brand-900/40 bg-brand-50 dark:bg-brand-900/15 px-3 py-2.5 text-center">
            <div className="flex items-center justify-center gap-1 mb-1 text-brand-500 dark:text-brand-400">
              <Table2 size={13} />
              <span className="text-[10px] font-semibold uppercase tracking-wide">Total</span>
            </div>
            <p className="text-base font-bold text-gray-800 dark:text-white leading-none">{validatedRows.all.length}</p>
          </div>
        </div>

        <button
          onClick={() => setSheetOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 hover:border-brand-400 dark:border-white/10 dark:bg-[#0b0f1a] dark:text-gray-300"
        >
          <Table2 size={14} />
          View Spreadsheet
        </button>
      </div>

      <Modal
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Spreadsheet View"
        size="full"
        noPadding
        footer={
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400">
              <CheckCircle2 size={14} /> {validatedRows.valid.length} Valid
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 font-semibold text-red-700 dark:bg-red-950/20 dark:text-red-400">
              <XCircle size={14} /> {validatedRows.invalid.length} Invalid
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 font-semibold text-brand-700 dark:bg-brand-950/20 dark:text-brand-400">
              <Table2 size={14} /> {validatedRows.all.length} Total
            </span>
          </div>
        }
      >
        <div className="inline-block min-w-full align-top border border-gray-200 dark:border-gray-700">
          <table className="min-w-max table-fixed text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-100 dark:bg-gray-800">
                <th className="px-3 py-3 font-semibold text-gray-500 dark:text-gray-400 border-b border-r border-gray-200 dark:border-gray-700 text-center w-12">#</th>
                <th className="px-3 py-3 font-semibold text-gray-500 dark:text-gray-400 border-b border-r border-gray-200 dark:border-gray-700 text-center w-16">Status</th>
                {headerFields.map(field => (
                  <th key={field} className="px-3 py-3 font-semibold text-gray-500 dark:text-gray-400 border-b border-r border-gray-200 dark:border-gray-700 whitespace-nowrap" style={{ width: 130 }}>
                    {fieldLabel(field)}
                    {field === "emp_code" && <span className="ml-1 text-red-400">*</span>}
                  </th>
                ))}
                <th className="px-3 py-3 font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 text-center w-16"></th>
              </tr>
            </thead>
            <tbody>
              {validatedRows.all.map((row, i) => {
                const even = i % 2 === 0;
                return (
                  <tr key={row.id} className={
                    row.isValid
                      ? (even ? "bg-white dark:bg-[#0b0f1a]" : "bg-emerald-50/20 dark:bg-emerald-950/5")
                      : (even ? "bg-red-50/30 dark:bg-red-950/10" : "bg-red-50/50 dark:bg-red-950/15")
                  }>
                    <td className="px-3 py-2.5 border-b border-r border-gray-100 dark:border-gray-800 text-center font-mono text-gray-400">{row.originalIndex + 2}</td>
                    <td className="px-3 py-2.5 border-b border-r border-gray-100 dark:border-gray-800 text-center">
                      {row.isValid
                        ? <CheckCircle2 size={14} className="text-emerald-500 mx-auto" />
                        : <span title={row.errors.join("; ")}><XCircle size={14} className="text-red-500 mx-auto" /></span>
                      }
                    </td>
                    {headerFields.map(field => {
                      const fieldHasError =
                        (field === "emp_code" && row.errors.some(e => e.toLowerCase().includes("employee code"))) ||
                        (field === "email" && row.errors.some(e => e.toLowerCase().includes("email")));
                      const errorReason = fieldHasError ? fieldErrorReason(field, row) : null;
                      return (
                      <td key={field} className={`px-3 py-2.5 border-b border-r border-gray-100 dark:border-gray-800 overflow-hidden ${fieldHasError ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300"}`} style={{ width: 130, maxWidth: 130 }}>
                        {isEditing(row.id, field) ? (
                          <input
                            ref={editRef}
                            defaultValue={row.data[field] ?? ""}
                            onBlur={saveEdit}
                            onKeyDown={e => {
                              if (e.key === "Enter") { e.preventDefault(); saveEdit(); }
                              if (e.key === "Escape") { e.preventDefault(); setEditing(null); }
                            }}
                            className="block w-full min-w-0 box-border rounded border-2 border-brand-500 bg-white px-2 py-1 text-xs text-gray-900 outline-none dark:bg-gray-800 dark:text-white"
                            autoFocus
                            onClick={e => e.stopPropagation()}
                          />
                        ) : (
                          <div onClick={() => openEdit(row.id, field)} className="cursor-pointer">
                            <span
                              className={`block truncate hover:text-brand-600 dark:hover:text-brand-400 ${fieldHasError ? "underline decoration-dotted decoration-red-400" : ""}`}
                              title={errorReason || row.data[field] || "Click to edit"}
                            >
                              {row.data[field] || <span className="text-gray-300 dark:text-gray-600">—</span>}
                            </span>
                            {errorReason && (
                              <span
                                className="mt-0.5 block truncate text-[10px] font-normal leading-tight text-red-500 dark:text-red-400"
                                title={errorReason}
                              >
                                {errorReason}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      );
                    })}
                    <td className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 text-center">
                      <button onClick={() => deleteRow(row.id)} className="rounded-md bg-red-100 p-1.5 text-red-600 transition hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400" title="Remove row">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {validatedRows.all.length === 0 && (
                <tr>
                  <td colSpan={headerFields.length + 3} className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">No data to display</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal>

      <div className="flex items-center justify-between gap-4 border-t border-gray-200 bg-gray-50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.02]">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {validatedRows.valid.length} row(s) ready to upload
          {validatedRows.invalid.length > 0 && ` · ${validatedRows.invalid.length} need correction`}
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={uploading}>Back</Button>
          <Button icon={<Upload size={14} />} onClick={handleConfirm} disabled={uploading || validatedRows.valid.length === 0}>
            {uploading ? "Uploading..." : `Upload ${validatedRows.valid.length} Employee(s)`}
          </Button>
        </div>
      </div>
    </div>
  );
}
