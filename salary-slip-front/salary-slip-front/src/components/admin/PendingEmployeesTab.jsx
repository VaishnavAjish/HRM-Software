import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { KeyRound, Building2, UserCircle, Search, Mail, Phone, Hash, Eye, Trash2, X } from "lucide-react";
import { salaryApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { getCompanyConfig } from "../../config/companyConfig";
import { getAadhaarDisplayValue } from "../../utils/aadhaar";

// Reuse the password validation logic
const isPasswordValid = (password) => {
  const minLength = 6;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  return (
    password.length >= minLength &&
    hasUpperCase &&
    hasLowerCase &&
    hasNumbers &&
    hasSpecialChar
  );
};

export default function PendingEmployeesTab() {
  const { user: currentUser } = useAuth();
  const { companyScope, companyId } = useCompany();
  
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  
  const [modal, setModal] = useState(null); // 'assign' | 'view' | 'delete'
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [form, setForm] = useState({ empCode: "", password: "", email: "" });
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // True when the code was already assigned on the Appointments page — the field
  // is then shown read-only and only the password is actually being set here.
  const codeAlreadyAssigned = Boolean(selectedEmp?.emp_code);

  const openAssign = (emp) => {
    setSelectedEmp(emp);
    setForm({
      empCode: emp.emp_code || "",
      password: "",
      email: emp.email || "",
    });
    setModal("assign");
  };

  const fetchPending = async () => {
    setLoading(true);
    try {
      const res = await salaryApi.getAllEmployees(
        currentUser?.accessToken,
        currentUser?.tokenType,
        { status: "2", limit: 1000 },
        companyScope
      );
      let data = res?.data?.users?.data ?? res?.data?.users ?? [];
      setEmployees(data);
    } catch (err) {
      toast.error(err.message || "Failed to load pending employees");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyScope]);

  const handleAssignCode = async (e) => {
    e.preventDefault();
    if (!form.empCode?.trim() || !form.password?.trim() || !form.email?.trim()) {
      toast.error("Email, Emp Code and Password are required");
      return;
    }
    if (!isPasswordValid(form.password)) {
      toast.error("Password must be 6+ chars with uppercase, lowercase, digit & special character");
      return;
    }
    setSaveLoading(true);
    try {
      await salaryApi.editEmployee(
        selectedEmp.id,
        {
          emp_code: form.empCode,
          password: form.password,
          email: form.email,
          type: null,
          status: 0 // Active status for direct login access
        },
        currentUser?.accessToken,
        currentUser?.tokenType,
        { companyId: selectedEmp?.company_code || companyId }
      );
      toast.success(
        codeAlreadyAssigned
          ? "Password assigned — employee can now log in"
          : "Employee code and password assigned successfully",
      );
      setModal(null);
      fetchPending();
    } catch (err) {
      toast.error(err.message || "Failed to assign credentials");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedEmp) return;
    setDeleteLoading(true);
    try {
      await salaryApi.deleteEmployee(
        selectedEmp.id,
        currentUser?.accessToken,
        currentUser?.tokenType,
        { companyId: selectedEmp?.company_code || companyId },
      );
      toast.success(`${selectedEmp.name || "Employee"} deleted`);
      setModal(null);
      setSelectedEmp(null);
      fetchPending();
    } catch (err) {
      toast.error(err.message || "Failed to delete employee");
    } finally {
      setDeleteLoading(false);
    }
  };

  const filtered = employees.filter(emp => {
    // Records that already carry an emp_code belong here too: assigning a code
    // on the Appointments page parks the record as pending_employee precisely so
    // a password can be set here before the login goes live.
    const q = search.toLowerCase();
    const name = (emp.name || emp.first_name || "").toLowerCase();
    const email = (emp.email || "").toLowerCase();
    const phone = (emp.mobile_number || emp.mobile_no || "").toLowerCase();
    return name.includes(q) || email.includes(q) || phone.includes(q);
  });

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-[#0b0f1a] rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm overflow-hidden min-h-[70vh]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 px-6 py-5 dark:border-white/10 shrink-0">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400">
            <UserCircle size={17} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Pending Employees</h2>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Employees waiting for ID and Password assignment
            </p>
          </div>
        </div>

        <div className="relative w-full sm:w-64">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search pending..."
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2 pl-9 text-sm text-gray-900 outline-none transition focus:border-brand-400 focus:bg-white dark:border-white/10 dark:bg-gray-800 dark:text-white dark:focus:bg-[#0b0f1a]"
          />
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {loading ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 text-gray-400">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            <p className="text-sm">Loading pending employees...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-gray-400 text-center">
            <UserCircle size={40} className="text-gray-300 dark:text-gray-600" />
            <p className="text-sm font-medium text-gray-500 dark:text-slate-400">
              {search ? "No matches found" : "No pending employees"}
            </p>
            <p className="text-xs text-gray-400 max-w-[250px]">
              All approved appointments have been processed and assigned.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(emp => (
              <div key={emp.id} className="flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                  <img
                    src={emp.photo || emp.avatar || `https://ui-avatars.com/api/?name=${emp.name}&background=random`}
                    alt={emp.name}
                    className="w-12 h-12 rounded-full object-cover bg-gray-100"
                    onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${emp.name}&background=random`; }}
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {emp.name || emp.first_name || "N/A"}
                    </h3>
                    <p className="text-xs text-brand-600 dark:text-brand-400 truncate font-medium">
                      {emp.designation || "No Designation"}
                    </p>
                  </div>
                </div>

                {/* Which step this record is waiting on. */}
                <div className="mb-3">
                  {emp.emp_code ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      <Hash size={11} />
                      {emp.emp_code} · needs password
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                      <Hash size={11} /> No code yet
                    </span>
                  )}
                </div>

                <div className="space-y-2 mb-5">
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Mail size={12} className="text-gray-400" />
                    <span className="truncate">{emp.email || "No Email"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Phone size={12} className="text-gray-400" />
                    <span>{emp.mobile_number || emp.mobile_no || "No Mobile"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Building2 size={12} className="text-gray-400" />
                    <span className="truncate">
                      {getCompanyConfig(emp.company_code)?.label || emp.company_code || "Unknown"}
                      {emp.unit ? ` - ${emp.unit}` : ""}
                    </span>
                  </div>
                </div>

                <div className="mt-auto pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
                  <button
                    onClick={() => openAssign(emp)}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-brand-50 hover:bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:hover:bg-brand-900/50 dark:text-brand-400 rounded-lg text-sm font-semibold transition-colors"
                  >
                    <KeyRound size={14} />
                    {emp.emp_code ? "Assign Password" : "Assign ID & Pass"}
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setSelectedEmp(emp);
                        setModal("view");
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg text-xs font-semibold transition-colors"
                    >
                      <Eye size={13} /> View
                    </button>
                    <button
                      onClick={() => {
                        setSelectedEmp(emp);
                        setModal("delete");
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-xs font-semibold transition-colors"
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal === "assign" && selectedEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <KeyRound size={16} className="text-brand-500" />
                {codeAlreadyAssigned ? "Assign Password" : "Assign Credentials"}
              </h3>
              <button
                onClick={() => setModal(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAssignCode} className="p-6">
              <div className="mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Assigning credentials to: <span className="font-semibold text-gray-900 dark:text-white">{selectedEmp.name || selectedEmp.first_name}</span>
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wider">
                    Email ID (Login ID)
                  </label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors"
                      placeholder="e.g. employee@company.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wider">
                    Employee Code
                  </label>
                  <div className="relative">
                    <Hash size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={form.empCode}
                      onChange={(e) => setForm({ ...form, empCode: e.target.value.toUpperCase() })}
                      readOnly={codeAlreadyAssigned}
                      className={`w-full pl-9 pr-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors ${
                        codeAlreadyAssigned
                          ? "bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                          : "bg-gray-50 dark:bg-gray-900"
                      }`}
                      placeholder="e.g. NI1234"
                      autoFocus={!codeAlreadyAssigned}
                    />
                  </div>
                  {codeAlreadyAssigned && (
                    <p className="text-[10px] text-gray-400 mt-1">
                      Already assigned on the Appointments page.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wider">
                    Initial Password
                  </label>
                  <div className="relative">
                    <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors"
                      placeholder="e.g. Employee@123"
                      autoFocus={codeAlreadyAssigned}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    Must be 6+ chars with uppercase, lowercase, digit & special char.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveLoading}
                  className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm shadow-brand-500/20"
                >
                  {saveLoading
                    ? "Assigning..."
                    : codeAlreadyAssigned
                      ? "Assign Password"
                      : "Assign Credentials"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === "view" && selectedEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 shrink-0">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <UserCircle size={16} className="text-brand-500" />
                Employee Details
              </h3>
              <button
                onClick={() => setModal(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex items-center gap-4 mb-6">
                <img
                  src={selectedEmp.photo || `https://ui-avatars.com/api/?name=${selectedEmp.name}&background=random`}
                  alt={selectedEmp.name}
                  className="w-16 h-16 rounded-full object-cover bg-gray-100"
                  onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${selectedEmp.name}&background=random`; }}
                />
                <div className="min-w-0">
                  <h4 className="text-base font-bold text-gray-900 dark:text-white break-words">
                    {selectedEmp.name || selectedEmp.first_name || "N/A"}
                  </h4>
                  <p className="text-xs font-medium text-brand-600 dark:text-brand-400">
                    {selectedEmp.designation || "No Designation"}
                  </p>
                </div>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                {[
                  ["Emp Code", selectedEmp.emp_code],
                  ["Email", selectedEmp.email],
                  ["Mobile", selectedEmp.mobile_number || selectedEmp.mobile_no],
                  ["WhatsApp", selectedEmp.emp_whatsapp_no],
                  ["Department", selectedEmp.department],
                  ["Designation", selectedEmp.designation],
                  ["Company", getCompanyConfig(selectedEmp.company_code)?.label || selectedEmp.company_code],
                  ["Unit / Branch", selectedEmp.unit],
                  ["Joining Date", selectedEmp.joining_date],
                  ["Date of Birth", selectedEmp.dob],
                  ["Gender", selectedEmp.gender],
                  ["Blood Group", selectedEmp.blood_group],
                  ["Salary", selectedEmp.salary],
                  ["Manager", selectedEmp.manager_name],
                  // The raw column is hidden from every response, so reading it
                  // directly always rendered blank.
                  ["Aadhaar No", getAadhaarDisplayValue(selectedEmp)],
                  ["PAN No", selectedEmp.pan_card_no],
                  ["Bank Name", selectedEmp.bank_name],
                  ["Bank A/C No", selectedEmp.bank_account_no],
                  ["IFSC", selectedEmp.bank_ifsc_code],
                  ["Address", selectedEmp.address],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400">
                      {label}
                    </dt>
                    <dd className="text-sm text-gray-900 dark:text-white break-words">
                      {value || <span className="text-gray-400">—</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex gap-3 shrink-0">
              <button
                onClick={() => setModal(null)}
                className="flex-1 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => openAssign(selectedEmp)}
                className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <KeyRound size={14} />
                {selectedEmp.emp_code ? "Assign Password" : "Assign ID & Pass"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "delete" && selectedEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                <Trash2 size={22} className="text-red-600" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">Delete Pending Employee</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Delete{" "}
                <strong className="text-gray-900 dark:text-white">
                  {selectedEmp.name || selectedEmp.first_name || "this employee"}
                </strong>
                ? This removes the record before any login was ever activated, and cannot be undone.
              </p>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setModal(null)}
                disabled={deleteLoading}
                className="flex-1 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {deleteLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
