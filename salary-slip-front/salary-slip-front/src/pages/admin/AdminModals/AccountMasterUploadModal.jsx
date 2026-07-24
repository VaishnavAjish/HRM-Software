import { useState } from "react";
import {
  Upload,
  X,
  FileSpreadsheet,
  CloudUpload,
  HardDrive,
  CheckCircle2,
  Hash,
  Layers,
  ArrowLeft,
  ArrowRight,
  Eye,
} from "lucide-react";
import Modal from "../../../components/ui/Modal";

export default function AccountMasterUploadModal({
  uploadOpen,
  resetUpload,
  uploading,
  selectedFile,
  preview,
  uploadCompany,
  uploadUnit,
  fileInputRef,
  handleFileChange,
  clearFile,
  fmtFileSize,
  handleUpload,
}) {
  const [dragOver, setDragOver] = useState(false);
  const [showFullPreview, setShowFullPreview] = useState(false);

  const currentStep = uploading || showFullPreview ? 3 : selectedFile ? 2 : 1;

  function handleReset() {
    setShowFullPreview(false);
    resetUpload();
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileChange({ target: { files: [file] } });
  }

  return (
    <Modal
      isOpen={uploadOpen}
      onClose={handleReset}
      size="xl"
      noPadding
      noHeader
      footer={
        <div className="flex items-center justify-between gap-3">
          {/* left info */}
          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
            {preview ? (
              <>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 font-medium">
                  <Hash size={10} /> {preview.totalRows} rows
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-medium">
                  <Layers size={10} /> {preview.sheetName}
                </span>
              </>
            ) : (
              <span className="text-gray-400 dark:text-gray-500">
                No file selected
              </span>
            )}
          </div>

          {/* right buttons */}
          <div className="flex gap-2.5">
            {showFullPreview ? (
              <>
                <button
                  onClick={() => setShowFullPreview(false)}
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition disabled:opacity-40"
                >
                  <ArrowLeft size={14} />
                  Back
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!selectedFile || uploading}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  {uploading ? (
                    <>
                      <svg
                        className="animate-spin h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v8H4z"
                        />
                      </svg>
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload size={14} />
                      Upload File
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleReset}
                  disabled={uploading}
                  className="rounded-xl border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setShowFullPreview(true)}
                  disabled={!selectedFile || uploading}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  <Eye size={14} />
                  Preview Data
                  <ArrowRight size={14} />
                </button>
              </>
            )}
          </div>
        </div>
      }
    >
      {/* ── Header ── */}
      <div className="rounded-t-2xl border-b border-gray-200 bg-white px-6 pt-5 pb-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 dark:bg-brand-900/25 dark:text-brand-300 dark:ring-brand-800/60">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                {showFullPreview ? "Data Preview" : "Upload Account Master"}
              </h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
                {showFullPreview
                  ? "Review all rows before uploading"
                  : `Import ${uploadCompany?.label} account master data from Excel`}
              </p>
              {!showFullPreview && (
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  Unit: {uploadUnit || "N.A."}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleReset}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200 transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="mt-5 flex items-center gap-0">
          {[
            { n: 1, label: "Select" },
            { n: 2, label: "Review" },
            { n: 3, label: "Preview & Upload" },
          ].map(({ n, label }, i) => {
            const isActive = currentStep === n;
            const isDone = currentStep > n;
            return (
              <div key={n} className="flex items-center flex-1 last:flex-none">
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-all ${
                      isDone
                        ? "bg-brand-600 border-brand-600 text-white"
                        : isActive
                          ? "bg-brand-50 border-brand-600 text-brand-700 dark:bg-brand-900/25 dark:text-brand-300"
                          : "bg-white border-gray-300 text-gray-400 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-500"
                    }`}
                  >
                    {isDone ? <CheckCircle2 size={14} /> : n}
                  </div>
                  <span
                    className={`text-xs font-semibold hidden sm:block ${
                      isActive
                        ? "text-brand-700 dark:text-brand-300"
                        : isDone
                          ? "text-gray-700 dark:text-gray-200"
                          : "text-gray-400 dark:text-gray-500"
                    }`}
                  >
                    {label}
                  </span>
                </div>
                {i < 2 && (
                  <div
                    className={`flex-1 h-px mx-2 ${isDone ? "bg-brand-200 dark:bg-brand-800" : "bg-gray-200 dark:bg-gray-700"}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Full Preview Screen ── */}
      {showFullPreview && preview ? (
        <div className="px-6 py-5 space-y-4">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 rounded-full bg-brand-600" />
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                  All Data — {selectedFile?.name}
                </span>
              </div>
              <span className="text-[11px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700/50 px-2 py-0.5 rounded-full">
                {preview.totalRows} rows
              </span>
            </div>
            <div className="overflow-x-auto" style={{ maxHeight: "55vh" }}>
              <table className="w-full text-xs min-w-max">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50 dark:bg-gray-700/60">
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-400 dark:text-gray-500 w-8">
                      #
                    </th>
                    {preview.headers.map((h, i) => (
                      <th
                        key={i}
                        className="px-3 py-2.5 text-left font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap"
                      >
                        {h || (
                          <span className="italic text-gray-400">
                            col {i + 1}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, ri) => (
                    <tr
                      key={ri}
                      className={`transition-colors hover:bg-brand-50/60 dark:hover:bg-brand-900/10 ${
                        ri % 2 === 0
                          ? "bg-white dark:bg-gray-800"
                          : "bg-gray-50/80 dark:bg-gray-800/50"
                      }`}
                    >
                      <td className="px-3 py-2 text-gray-300 dark:text-gray-600 font-mono border-t border-gray-100 dark:border-gray-700/60">
                        {ri + 1}
                      </td>
                      {preview.headers.map((_, ci) => (
                        <td
                          key={ci}
                          className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap max-w-[180px] truncate border-t border-gray-100 dark:border-gray-700/60"
                          title={String(row[ci] ?? "")}
                        >
                          {row[ci] !== "" && row[ci] != null ? (
                            String(row[ci])
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600">
                              —
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* ── Select / Review Screen ── */
        <div className="px-6 py-5 space-y-4">
          {!selectedFile && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`group relative cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
                dragOver
                  ? "border-brand-400 bg-brand-50 dark:bg-brand-900/20 scale-[1.01]"
                  : "border-gray-200 bg-gray-50/70 dark:border-gray-700 dark:bg-gray-900/20 hover:border-brand-300 dark:hover:border-brand-700 hover:bg-brand-50/60 dark:hover:bg-brand-900/10"
              }`}
            >
              <div
                className={`w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center transition-all duration-200 ${
                  dragOver
                    ? "bg-brand-100 dark:bg-brand-900/40 scale-110"
                    : "bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700 group-hover:bg-brand-100 dark:group-hover:bg-brand-900/30"
                }`}
              >
                <CloudUpload
                  size={30}
                  className={`transition-colors ${
                    dragOver
                      ? "text-brand-600"
                      : "text-gray-400 dark:text-gray-500 group-hover:text-brand-600"
                  }`}
                />
              </div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">
                {dragOver ? "Drop it here!" : "Drag & drop your file here"}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
                or click anywhere to browse your computer
              </p>
              <div className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700">
                <Upload size={13} />
                Browse Files
              </div>
              <div className="flex items-center justify-center gap-2 mt-4">
                {[".xlsx", ".xls"].map((ext) => (
                  <span
                    key={ext}
                    className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[11px] font-mono font-semibold"
                  >
                    {ext}
                  </span>
                ))}
                <span className="text-[11px] text-gray-400">accepted</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          )}

          {selectedFile && (
            <div className="flex items-center gap-4 rounded-2xl border border-brand-100 bg-brand-50/70 px-4 py-3.5 dark:border-brand-900/50 dark:bg-brand-900/15">
              <div className="w-11 h-11 rounded-xl bg-brand-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                <FileSpreadsheet size={20} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {fmtFileSize(selectedFile.size)} · Ready to upload
                </p>
              </div>
              <button
                onClick={clearFile}
                disabled={uploading}
                className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition flex-shrink-0 disabled:opacity-40"
                title="Remove file"
              >
                <X size={15} />
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
