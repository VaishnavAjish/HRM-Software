import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  X,
  Search,
  Download,
  CloudUpload,
  Loader2,
  Trash2,
  Save,
  Fingerprint,
  Cpu,
  Pencil,
} from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import UploadBatchPanel from "./UploadBatchPanel";
import { salaryApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { saveJsonToXlsx, parseSheetToRows } from "../../utils/excel";

function findColumnIndex(headers, aliases) {
  return headers.findIndex((h) => {
    const norm = String(h ?? "").trim().toLowerCase();
    return aliases.some((alias) => norm === alias || norm.includes(alias));
  });
}

/**
 * Map an employee to the punching code their biometric device actually
 * reports (attendance_employee_code_map) -- single mapping via a search +
 * form, or bulk via an Excel template download/upload. Fixes the case where
 * an employee's HR emp_code doesn't match what the device sends, so their
 * punches were never resolving to them.
 *
 * `deviceSerials` is the org's known list of eSSL machine serials (the same
 * constant AttendanceView.jsx's sync UI uses) -- not the `attendance_devices`
 * table, which is only ever seeded by a migration that may not have reached
 * every environment, so querying it here could show an empty dropdown even
 * though the machines are real and in daily use.
 */
export default function MapAttendanceModal({ isOpen, onClose, employees, companyId, deviceSerials = [] }) {
  const { user } = useAuth();
  const [mode, setMode] = useState("single"); // "single" | "bulk" | "machines"

  // ---- Single mapping ----
  const [empQuery, setEmpQuery] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [punchingCode, setPunchingCode] = useState("");
  const [deviceSerial, setDeviceSerial] = useState("");
  const [saving, setSaving] = useState(false);

  const [maps, setMaps] = useState([]);
  const [mapsLoading, setMapsLoading] = useState(false);
  const [mapSearch, setMapSearch] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  // ---- Machine naming ----
  const [deviceList, setDeviceList] = useState([]); // [{ id, serial_number, name }]
  const [deviceListLoading, setDeviceListLoading] = useState(false);
  const [deviceNameDrafts, setDeviceNameDrafts] = useState({}); // serial -> draft name
  const [savingSerial, setSavingSerial] = useState(null);

  // ---- Bulk mapping ----
  const [dragOver, setDragOver] = useState(false);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [refreshBatches, setRefreshBatches] = useState(0);
  const fileInputRef = useRef(null);

  const loadMaps = async (search) => {
    setMapsLoading(true);
    try {
      const res = await salaryApi.getAttendanceCodeMaps(
        { company_code: companyId, search: search || undefined },
        user?.accessToken,
        user?.tokenType
      );
      setMaps(res?.data || []);
    } catch (err) {
      toast.error(err.message || "Failed to load mappings");
    } finally {
      setMapsLoading(false);
    }
  };

  const loadDevices = async () => {
    setDeviceListLoading(true);
    try {
      const res = await salaryApi.getAttendanceCodeMapDevices(user?.accessToken, user?.tokenType);
      const list = res?.data || [];
      setDeviceList(list);
      setDeviceNameDrafts(Object.fromEntries(list.map((d) => [d.serial_number, d.name || ""])));
    } catch (err) {
      // Fall back to the bare serial list so the dropdown/tab still work
      // even if the devices endpoint is unreachable.
      const fallback = deviceSerials.map((serial) => ({ id: null, serial_number: serial, name: null }));
      setDeviceList(fallback);
      setDeviceNameDrafts(Object.fromEntries(fallback.map((d) => [d.serial_number, ""])));
      toast.error(err.message || "Failed to load machine list");
    } finally {
      setDeviceListLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadMaps(mapSearch);
    loadDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, companyId]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const t = setTimeout(() => loadMaps(mapSearch), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapSearch]);

  const employeeMatches = useMemo(() => {
    const q = empQuery.trim().toLowerCase();
    if (!q) return [];
    return (employees || [])
      .filter(
        (e) =>
          String(e.name || "").toLowerCase().includes(q) ||
          String(e.emp_code || "").toLowerCase().includes(q) ||
          String(e.punching_no || "").toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [employees, empQuery]);

  const resetSingleForm = () => {
    setSelectedEmployee(null);
    setEmpQuery("");
    setPunchingCode("");
    setDeviceSerial("");
  };

  const handleSaveMapping = async () => {
    if (!selectedEmployee) {
      toast.error("Select an employee first.");
      return;
    }
    if (!punchingCode.trim()) {
      toast.error("Enter the punching code.");
      return;
    }
    setSaving(true);
    try {
      await salaryApi.saveAttendanceCodeMap(
        {
          user_id: selectedEmployee.id,
          punching_code: punchingCode.trim(),
          device_serial: deviceSerial || null,
        },
        user?.accessToken,
        user?.tokenType
      );
      toast.success(`Mapped ${selectedEmployee.name} to punching code ${punchingCode.trim()}`);
      resetSingleForm();
      loadMaps(mapSearch);
    } catch (err) {
      toast.error(err.message || "Failed to save mapping");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMapping = async (id) => {
    if (!window.confirm("Remove this mapping? Biometric punches under this code will stop resolving to this employee.")) return;
    setDeletingId(id);
    try {
      await salaryApi.deleteAttendanceCodeMap(id, user?.accessToken, user?.tokenType);
      setMaps((prev) => prev.filter((m) => m.id !== id));
      toast.success("Mapping removed");
    } catch (err) {
      toast.error(err.message || "Failed to remove mapping");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveDeviceName = async (serial) => {
    const name = (deviceNameDrafts[serial] || "").trim();
    setSavingSerial(serial);
    try {
      const res = await salaryApi.nameAttendanceDevice({ serial_number: serial, name }, user?.accessToken, user?.tokenType);
      setDeviceList((prev) => prev.map((d) => (d.serial_number === serial ? { ...d, name: res?.data?.name ?? name, id: res?.data?.id ?? d.id } : d)));
      toast.success(name ? `Machine named "${name}"` : "Machine name cleared");
    } catch (err) {
      toast.error(err.message || "Failed to save machine name");
    } finally {
      setSavingSerial(null);
    }
  };

  const downloadTemplate = () => {
    const rows = (employees || []).map((e) => ({
      "Employee Code": e.emp_code ?? "",
      "Employee Name": e.name ?? "",
      "Punching Code": e.punching_no ?? "",
    }));
    saveJsonToXlsx(
      "attendance_code_map_template.xlsx",
      "Mapping",
      rows.length ? rows : [{ "Employee Code": "", "Employee Name": "", "Punching Code": "" }]
    );
    toast.success("Template downloaded — fill the Punching Code column and upload it back");
  };

  const validateAndParseFile = async (file) => {
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
      const arrayBuffer = await file.arrayBuffer();
      const data = await parseSheetToRows(arrayBuffer);
      setUploadPreview(data);
    } catch {
      toast.error("Could not read file. Make sure it is a valid Excel file.");
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) validateAndParseFile(file);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndParseFile(file);
  };
  const clearFile = () => {
    setUploadPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const parsedRows = useMemo(() => {
    if (!uploadPreview) return [];
    const empCodeIdx = findColumnIndex(uploadPreview.headers, ["employee code", "emp code", "code"]);
    const punchingIdx = findColumnIndex(uploadPreview.headers, [
      "punching code",
      "punching no",
      "punching_no",
      "device code",
      "device user code",
    ]);
    return uploadPreview.rows
      .map((r) => ({
        employee_code: String(r[empCodeIdx] ?? "").trim(),
        punching_code: String(r[punchingIdx] ?? "").trim(),
      }))
      .filter((r) => r.employee_code || r.punching_code);
  }, [uploadPreview]);

  const completeRows = parsedRows.filter((r) => r.employee_code && r.punching_code);

  const handleBulkImport = async () => {
    if (completeRows.length === 0) {
      toast.error("No complete rows (Employee Code + Punching Code) found to import.");
      return;
    }
    setUploading(true);
    try {
      const res = await salaryApi.bulkImportAttendanceCodeMap(
        { company_code: companyId, rows: completeRows },
        user?.accessToken,
        user?.tokenType
      );
      const skipped = res?.skipped ?? [];
      toast.success(
        skipped.length > 0
          ? `Mapped ${res?.imported ?? 0} employee(s). Skipped ${skipped.length} due to issues.`
          : `Mapped ${res?.imported ?? 0} employee(s).`
      );
      clearFile();
      loadMaps(mapSearch);
      setRefreshBatches((p) => p + 1);
    } catch (err) {
      toast.error(err.message || "Failed to import mappings");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Map Attendance — Employee & Punching Code" size="3xl">
      <div className="flex flex-col gap-4">
        <div className="inline-flex rounded-xl border border-gray-200 dark:border-gray-700 p-1 bg-gray-50 dark:bg-gray-900 self-start">
          <button
            onClick={() => setMode("single")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              mode === "single" ? "bg-white dark:bg-gray-700 shadow-sm text-brand-600 dark:text-brand-400" : "text-gray-500"
            }`}
          >
            Single Mapping
          </button>
          <button
            onClick={() => setMode("bulk")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              mode === "bulk" ? "bg-white dark:bg-gray-700 shadow-sm text-brand-600 dark:text-brand-400" : "text-gray-500"
            }`}
          >
            Bulk Mapping (Excel)
          </button>
          <button
            onClick={() => setMode("machines")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              mode === "machines" ? "bg-white dark:bg-gray-700 shadow-sm text-brand-600 dark:text-brand-400" : "text-gray-500"
            }`}
          >
            Machines
          </button>
        </div>

        {mode === "single" ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 p-3.5 flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1 relative">
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Employee</label>
                  {selectedEmployee ? (
                    <div className="flex items-center justify-between rounded-lg border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/40 px-3 py-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-800 dark:text-gray-100 truncate">{selectedEmployee.name}</div>
                        <div className="text-[10px] text-gray-400">Code: {selectedEmployee.emp_code}</div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedEmployee(null);
                          setEmpQuery("");
                        }}
                        className="text-gray-400 hover:text-gray-600 shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                        <input
                          value={empQuery}
                          onChange={(e) => setEmpQuery(e.target.value)}
                          placeholder="Search name or code..."
                          className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 pl-8 pr-3 py-2 text-xs outline-none focus:ring-2 focus:ring-brand-500/20"
                        />
                      </div>
                      {employeeMatches.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
                          {employeeMatches.map((e) => (
                            <button
                              key={e.id || e.emp_code}
                              onClick={() => {
                                setSelectedEmployee(e);
                                setEmpQuery("");
                              }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-0"
                            >
                              <div className="font-medium text-gray-800 dark:text-gray-100">{e.name}</div>
                              <div className="text-[10px] text-gray-400">
                                Code: {e.emp_code} {e.punching_no ? `· Punching: ${e.punching_no}` : ""}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Punching Code</label>
                  <input
                    value={punchingCode}
                    onChange={(e) => setPunchingCode(e.target.value)}
                    placeholder="e.g. 10044"
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-brand-500/20 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Device Machine (optional)</label>
                  <select
                    value={deviceSerial}
                    onChange={(e) => setDeviceSerial(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-2 text-xs outline-none focus:ring-2 focus:ring-brand-500/20 font-mono"
                  >
                    <option value="">Any Device</option>
                    {(deviceList.length ? deviceList : deviceSerials.map((serial) => ({ serial_number: serial, name: null }))).map((d) => (
                      <option key={d.serial_number} value={d.serial_number}>
                        {d.name ? `${d.name} (${d.serial_number})` : d.serial_number}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleSaveMapping}
                  disabled={saving}
                  icon={saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                >
                  {saving ? "Saving..." : "Save Mapping"}
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="flex items-center justify-between gap-2 p-2.5 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                <span className="text-[11px] font-bold uppercase text-gray-500">Existing Mappings ({maps.length})</span>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                  <input
                    value={mapSearch}
                    onChange={(e) => setMapSearch(e.target.value)}
                    placeholder="Search..."
                    className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 pl-7 pr-2 py-1 text-[11px] outline-none w-40"
                  />
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {mapsLoading ? (
                  <div className="py-8 text-center text-xs text-gray-400">Loading…</div>
                ) : maps.length === 0 ? (
                  <div className="py-8 text-center text-xs text-gray-400">No mappings yet.</div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900 z-10">
                      <tr className="text-[10px] uppercase text-gray-400">
                        <th className="px-3 py-2">Employee</th>
                        <th className="px-3 py-2">Punching Code</th>
                        <th className="px-3 py-2">Device</th>
                        <th className="px-3 py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {maps.map((m) => (
                        <tr key={m.id} className="border-t border-gray-100 dark:border-gray-800">
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-800 dark:text-gray-100">{m.user?.name || "—"}</div>
                            <div className="text-[10px] text-gray-400">Code: {m.user?.emp_code || "—"}</div>
                          </td>
                          <td className="px-3 py-2 font-mono">{m.device_user_code}</td>
                          <td className="px-3 py-2 text-gray-500">{m.device?.name || m.device?.serial_number || "Any Device"}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() => handleDeleteMapping(m.id)}
                              disabled={deletingId === m.id}
                              className="text-red-500 hover:text-red-600 disabled:opacity-50"
                              title="Remove mapping"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        ) : mode === "bulk" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 p-3.5">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Download the template (pre-filled with employee codes/names), fill the <strong>Punching Code</strong>{" "}
                column for each employee, then upload it back.
              </p>
              <Button variant="secondary" icon={<Download className="h-3.5 w-3.5" />} onClick={downloadTemplate}>
                Download Template
              </Button>
            </div>

            {uploadPreview ? (
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="flex items-center justify-between p-2.5 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                  <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300">
                    {parsedRows.length} row(s) parsed, {completeRows.length} complete
                  </span>
                  <button onClick={clearFile} className="text-xs text-gray-400 hover:text-gray-600">
                    Clear
                  </button>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900 z-10">
                      <tr className="text-[10px] uppercase text-gray-400">
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Employee Code</th>
                        <th className="px-3 py-2">Punching Code</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.map((r, i) => (
                        <tr
                          key={i}
                          className={`border-t border-gray-100 dark:border-gray-800 ${
                            !r.employee_code || !r.punching_code ? "bg-red-50/50 dark:bg-red-950/20" : ""
                          }`}
                        >
                          <td className="px-3 py-1.5 text-gray-400">{i + 2}</td>
                          <td className="px-3 py-1.5 font-mono">{r.employee_code || "—"}</td>
                          <td className="px-3 py-1.5 font-mono">{r.punching_code || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end p-2.5 border-t border-gray-200 dark:border-gray-800">
                  <Button
                    onClick={handleBulkImport}
                    disabled={uploading || completeRows.length === 0}
                    icon={uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
                  >
                    {uploading ? "Importing..." : `Import ${completeRows.length} Row(s)`}
                  </Button>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition ${
                  dragOver
                    ? "border-brand-500 bg-brand-50/20 dark:bg-brand-950/10"
                    : "border-gray-300 dark:border-gray-700 hover:border-brand-400"
                }`}
              >
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx,.xls" className="hidden" />
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400 mb-3">
                  <CloudUpload className="h-4 w-4" />
                </div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Drag and drop your filled-in mapping sheet here, or <span className="text-brand-600">browse</span>
                </p>
              </div>
            )}

            <UploadBatchPanel
              type="attendance_code_map"
              icon={Fingerprint}
              title="Mapping Upload History"
              refreshKey={refreshBatches}
              companyId={companyId}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Give each eSSL machine serial a friendly name (e.g. "Main Gate", "Factory Floor 2") so it's easier to pick
              in the Device Machine dropdown above. This only labels the machine -- it doesn't change what it syncs.
            </p>
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="max-h-96 overflow-y-auto">
                {deviceListLoading ? (
                  <div className="py-8 text-center text-xs text-gray-400">Loading…</div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900 z-10">
                      <tr className="text-[10px] uppercase text-gray-400">
                        <th className="px-3 py-2">Serial Number</th>
                        <th className="px-3 py-2">Machine Name</th>
                        <th className="px-3 py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deviceList.map((d) => (
                        <tr key={d.serial_number} className="border-t border-gray-100 dark:border-gray-800">
                          <td className="px-3 py-2 font-mono text-gray-500 flex items-center gap-1.5">
                            <Cpu className="h-3 w-3 text-gray-400 shrink-0" />
                            {d.serial_number}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={deviceNameDrafts[d.serial_number] ?? ""}
                              onChange={(e) =>
                                setDeviceNameDrafts((prev) => ({ ...prev, [d.serial_number]: e.target.value }))
                              }
                              placeholder="e.g. Main Gate"
                              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500/20"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() => handleSaveDeviceName(d.serial_number)}
                              disabled={
                                savingSerial === d.serial_number ||
                                (deviceNameDrafts[d.serial_number] ?? "") === (d.name || "")
                              }
                              title="Save machine name"
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/30 disabled:opacity-40"
                            >
                              {savingSerial === d.serial_number ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Pencil className="h-3 w-3" />
                              )}
                              Save
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
