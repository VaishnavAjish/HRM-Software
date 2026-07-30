import { useState, useMemo, useRef, useCallback } from "react";
import { CheckCircle2, XCircle, Trash2, Upload, Table2 } from "lucide-react";
import toast from "react-hot-toast";
import Button from "../ui/Button";
import Modal from "../ui/Modal";

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function normalize(v) {
  return String(v ?? "").trim().toLowerCase();
}

// Header-name matching so this works against whatever a user's own sheet
// calls these columns, not just the app's own downloaded template.
function findColumnIndex(headers, aliases) {
  return headers.findIndex((h) => {
    const norm = normalize(h);
    return aliases.some((alias) => norm === alias || norm.includes(alias));
  });
}

function isRecognizedMonth(value) {
  const s = normalize(value);
  if (!s) return false;
  if (/^\d{1,2}$/.test(s)) {
    const n = parseInt(s, 10);
    return n >= 1 && n <= 12;
  }
  return MONTH_NAMES.some((m) => m === s || m.startsWith(s.slice(0, 3)));
}

export default function BulkSalaryValidation({
  headers,
  rawRows,
  onConfirm,
  onCancel,
  uploading = false,
}) {
  const [rows, setRows] = useState(() =>
    rawRows.map((values, idx) => ({ id: idx, originalIndex: idx, values: [...values], deleted: false }))
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const editRef = useRef(null);

  const empCodeColIdx = useMemo(
    () => findColumnIndex(headers, ["employee code", "emp code", "code"]),
    [headers],
  );
  const monthColIdx = useMemo(() => findColumnIndex(headers, ["month"]), [headers]);

  const validateRow = useCallback((row) => {
    const errors = [];
    if (empCodeColIdx === -1) {
      errors.push("No Employee Code column found in this file");
      return errors;
    }
    const empCode = normalize(row.values[empCodeColIdx]);
    if (!empCode) {
      errors.push("Employee code is required");
    }
    const duplicateInFile = rows.filter(
      (r) => !r.deleted && r.id !== row.id && normalize(r.values[empCodeColIdx]) === empCode
    );
    if (empCode && duplicateInFile.length > 0) {
      errors.push("Duplicate employee code within file");
    }
    if (monthColIdx !== -1 && !isRecognizedMonth(row.values[monthColIdx])) {
      errors.push("Unrecognized month value");
    }
    return errors;
  }, [empCodeColIdx, monthColIdx, rows]);

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

  function openEdit(rowId, colIdx) {
    setEditing({ rowId, colIdx });
  }

  function saveEdit() {
    if (!editing || !editRef.current) { setEditing(null); return; }
    const { rowId, colIdx } = editing;
    const val = editRef.current.value;
    if (colIdx === empCodeColIdx && !normalize(val)) {
      toast.error("Employee code cannot be empty");
      setEditing(null);
      return;
    }
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const values = [...r.values];
      values[colIdx] = val;
      return { ...r, values };
    }));
    setEditing(null);
  }

  function deleteRow(id) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, deleted: true } : r));
  }

  function handleConfirm() {
    if (uploading) return;
    const validData = validatedRows.valid.map(r => [...r.values]);
    if (validData.length === 0) {
      toast.error("No valid rows to upload");
      return;
    }
    onConfirm(validData);
  }

  const isEditing = (rowId, colIdx) =>
    editing?.rowId === rowId && editing?.colIdx === colIdx;

  function fieldErrorReason(colIdx, row) {
    if (colIdx === empCodeColIdx) {
      return row.errors.find(e => e.toLowerCase().includes("employee code"));
    }
    if (colIdx === monthColIdx) {
      return row.errors.find(e => e.toLowerCase().includes("month"));
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
                {headers.map((header, colIdx) => (
                  <th key={colIdx} className="px-3 py-3 font-semibold text-gray-500 dark:text-gray-400 border-b border-r border-gray-200 dark:border-gray-700 whitespace-nowrap" style={{ width: 150 }}>
                    {header || `Column ${colIdx + 1}`}
                    {colIdx === empCodeColIdx && <span className="ml-1 text-red-400">*</span>}
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
                    {headers.map((_, colIdx) => {
                      const errorReason = fieldErrorReason(colIdx, row);
                      const fieldHasError = Boolean(errorReason);
                      return (
                        <td key={colIdx} className={`px-3 py-2.5 border-b border-r border-gray-100 dark:border-gray-800 overflow-hidden ${fieldHasError ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300"}`} style={{ width: 150, maxWidth: 150 }}>
                          {isEditing(row.id, colIdx) ? (
                            <input
                              ref={editRef}
                              defaultValue={row.values[colIdx] ?? ""}
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
                            <div onClick={() => openEdit(row.id, colIdx)} className="cursor-pointer">
                              <span
                                className={`block truncate hover:text-brand-600 dark:hover:text-brand-400 ${fieldHasError ? "underline decoration-dotted decoration-red-400" : ""}`}
                                title={errorReason || row.values[colIdx] || "Click to edit"}
                              >
                                {row.values[colIdx] || <span className="text-gray-300 dark:text-gray-600">—</span>}
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
                  <td colSpan={headers.length + 3} className="px-4 py-12 text-center text-sm text-gray-400">No data to display</td>
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
            {uploading ? "Uploading..." : `Upload ${validatedRows.valid.length} Slip(s)`}
          </Button>
        </div>
      </div>
    </div>
  );
}
