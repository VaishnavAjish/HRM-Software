import {
  Hash,
  FileSpreadsheet,
  Upload,
  X,
  CheckCircle,
  CloudUpload,
  TableProperties,
  HardDrive,
} from "lucide-react";
import Modal from "../../../components/ui/Modal";

export default function EmployeeImportModal({
  uploadOpen,
  resetUpload,
  preview,
  uploading,
  selectedFile,
  importColumnsLoading,
  employeeImportColumns,
  missingRequiredImportFields,
  handleUpload,
  dragOver,
  setDragOver,
  handleDrop,
  fileInputRef,
  handleFileChange,
  fmtFileSize,
  clearFile,
  fileHeaders,
  mappedFieldCount,
  requiredEmployeeImportFields,
  columnMappings,
  updateColumnMapping,
  selectCls,
  formatEmployeeImportFieldLabel,
}) {
  return (
    <Modal
      isOpen={uploadOpen}
      onClose={resetUpload}
      size="xl"
      noPadding
      noHeader
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
            {preview ? (
              <>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 font-medium">
                  <Hash size={10} /> {preview.totalRows} rows
                </span>

                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-medium">
                  <FileSpreadsheet size={10} /> {preview.sheetName}
                </span>
              </>
            ) : (
              <span className="text-gray-400 dark:text-gray-500">
                No file selected
              </span>
            )}
          </div>

          <div className="flex gap-2.5">
            <button
              onClick={resetUpload}
              disabled={uploading}
              className="rounded-xl border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition disabled:opacity-40"
            >
              Cancel
            </button>

            <button
              onClick={handleUpload}
              disabled={
                !selectedFile ||
                importColumnsLoading ||
                employeeImportColumns.length === 0 ||
                uploading ||
                missingRequiredImportFields.length > 0
              }
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
          </div>
        </div>
      }
    >
      <div className="rounded-t-2xl border-b border-gray-200 bg-white px-6 pt-5 pb-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 dark:bg-brand-900/25 dark:text-brand-300 dark:ring-brand-800/60">
              <FileSpreadsheet size={24} />
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                Import Employees
              </h3>

              <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
                Upload Excel file to add new employees
              </p>
            </div>
          </div>

          <button
            onClick={resetUpload}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200 transition"
            aria-label="Close upload dialog"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 flex items-center gap-0">
          {[
            { n: 1, label: "Select" },
            { n: 2, label: "Preview" },
            { n: 3, label: "Upload" },
          ].map(({ n, label }, i) => {
            const currentStep = uploading ? 3 : selectedFile ? 2 : 1;
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
                    {isDone ? <CheckCircle size={14} /> : n}
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
                    className={`flex-1 h-px mx-2 ${
                      isDone
                        ? "bg-brand-200 dark:bg-brand-800"
                        : "bg-gray-200 dark:bg-gray-700"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-6 py-5 space-y-4">
        {!selectedFile && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`group relative cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
              dragOver
                ? "border-brand-400 bg-brand-50 dark:bg-brand-900/20 scale-[1.01]"
                : "border-gray-200 bg-gray-50/70 dark:bg-gray-700 dark:bg-gray-900/20 hover:border-brand-300 dark:hover:border-brand-700 hover:bg-brand-50/60 dark:hover:bg-brand-900/10"
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
          <>
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
                className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition flex-shrink-0"
                title="Remove file"
              >
                <X size={15} />
              </button>
            </div>

            {preview && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {[
                  {
                    icon: <Hash size={13} />,
                    label: "Rows",
                    value: preview.totalRows,
                    color: "blue",
                  },
                  {
                    icon: <TableProperties size={13} />,
                    label: "Columns",
                    value: preview.headers.length,
                    color: "indigo",
                  },
                  {
                    icon: <HardDrive size={13} />,
                    label: "Size",
                    value: fmtFileSize(selectedFile.size),
                    color: "violet",
                  },
                ].map(({ icon, label, value, color }) => (
                  <div
                    key={label}
                    className={`rounded-xl border px-3 py-2.5 text-center ${
                      color === "blue"
                        ? "border-brand-100 dark:border-brand-900/40 bg-brand-50 dark:bg-brand-900/15"
                        : color === "indigo"
                          ? "border-indigo-100 dark:border-indigo-900/40 bg-indigo-50 dark:bg-indigo-900/15"
                          : "border-violet-100 dark:border-violet-900/40 bg-violet-50 dark:bg-violet-900/15"
                    }`}
                  >
                    <div
                      className={`flex items-center justify-center gap-1 mb-1 ${
                        color === "blue"
                          ? "text-brand-500 dark:text-brand-400"
                          : color === "indigo"
                            ? "text-indigo-500 dark:text-indigo-400"
                            : "text-violet-500 dark:text-violet-400"
                      }`}
                    >
                      {icon}
                      <span className="text-[10px] font-semibold uppercase tracking-wide">
                        {label}
                      </span>
                    </div>

                    <p className="text-base font-bold text-gray-800 dark:text-white leading-none">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {preview && preview.headers.length > 0 && (
              <div>
                <div className="mb-4 overflow-hidden rounded-2xl border border-gray-200 shadow-sm dark:border-gray-700">
                  <div className="flex items-center justify-between gap-4 border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/80">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                        Match File Headers To Database Columns
                      </p>
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        Map each uploaded file column to a safe employee
                        database field
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                        {fileHeaders.length} file columns
                      </p>
                      <p className="text-[11px] text-gray-400 dark:text-gray-500">
                        {importColumnsLoading
                          ? "Loading database columns..."
                          : `${employeeImportColumns.length} database columns`}
                      </p>
                      <p className="text-[11px] text-gray-400 dark:text-gray-500">
                        {mappedFieldCount} mapped
                      </p>
                    </div>
                  </div>

                  {importColumnsLoading && (
                    <div className="border-b border-gray-200 bg-brand-50 px-4 py-3 text-xs font-medium text-brand-700 dark:border-gray-700 dark:bg-brand-900/20 dark:text-brand-300">
                      Loading safe database columns from the server...
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(220px,1fr)] border-b border-gray-200 bg-white text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                      <div className="border-r border-gray-200 px-4 py-3 dark:border-gray-700">
                        File Column
                      </div>
                      <div className="px-4 py-3">Database Column</div>
                    </div>

                    <div className="max-h-80 overflow-y-auto">
                      {fileHeaders.map((header) => (
                        <div
                          key={header.id}
                          className="grid grid-cols-[minmax(0,1fr)_minmax(220px,1fr)] border-b border-gray-100 last:border-b-0 dark:border-gray-700/70"
                        >
                          <div className="border-r border-gray-100 px-4 py-3 dark:border-gray-700/70">
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                              {header.label}
                            </p>
                            <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                              Column {header.index + 1}
                            </p>
                          </div>

                          <div className="px-4 py-3">
                            <select
                              value={columnMappings[header.id] || ""}
                              onChange={(event) =>
                                updateColumnMapping(header.id, event.target.value)
                              }
                              disabled={
                                importColumnsLoading ||
                                employeeImportColumns.length === 0
                              }
                              className={selectCls}
                            >
                              <option value="">Skip this column</option>
                              {employeeImportColumns.map((field) => (
                                <option key={field.key} value={field.key}>
                                  {formatEmployeeImportFieldLabel(field)}
                                  {field.required ? " *" : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 px-4 py-3 text-xs dark:bg-gray-800/80">
                    <div className="flex flex-wrap gap-2">
                      {requiredEmployeeImportFields.map((field) => (
                        <span
                          key={field.key}
                          className={`inline-flex items-center rounded-full px-2.5 py-1 font-semibold ${
                            Object.values(columnMappings).includes(field.key)
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                          }`}
                        >
                          {formatEmployeeImportFieldLabel(field)}
                        </span>
                      ))}
                    </div>

                    <p className="text-gray-500 dark:text-gray-400">
                      {importColumnsLoading
                        ? "Loading database columns..."
                        : missingRequiredImportFields.length > 0
                          ? `Required: ${missingRequiredImportFields.map((field) => field.label).join(", ")}`
                          : "All required columns are mapped"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 rounded-full bg-brand-600" />
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                      Data Preview
                    </span>
                  </div>

                  {preview.totalRows > 6 && (
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700/50 px-2 py-0.5 rounded-full">
                      Showing 6 of {preview.totalRows}
                    </span>
                  )}
                </div>

                <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
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
                                <span className="italic text-gray-500">
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
                                className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap max-w-[160px] truncate border-t border-gray-100 dark:border-gray-700/60"
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
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
