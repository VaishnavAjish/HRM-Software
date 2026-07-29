import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { KeyRound, Building2, UserCircle, Search, Mail, Phone, Hash } from "lucide-react";
import { salaryApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { getCompanyConfig } from "../../config/companyConfig";

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
  
  const [modal, setModal] = useState(null);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [form, setForm] = useState({ empCode: "", password: "", email: "" });
  const [saveLoading, setSaveLoading] = useState(false);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const res = await salaryApi.getAllEmployees(
        currentUser?.accessToken,
        currentUser?.tokenType,
        "?status=2&limit=1000",
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
          status: 2 // Keep pending until details fully filled by employee
        },
        currentUser?.accessToken,
        currentUser?.tokenType,
        { companyId: selectedEmp?.company_code || companyId }
      );
      toast.success("Employee code and password assigned successfully");
      setModal(null);
      fetchPending();
    } catch (err) {
      toast.error(err.message || "Failed to assign credentials");
    } finally {
      setSaveLoading(false);
    }
  };

  const filtered = employees.filter(emp => {
    // Hide employees that already have an emp_code (they are pending detail fill by themselves)
    if (emp.emp_code) return false;
    
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

                <div className="mt-auto pt-3 border-t border-gray-100 dark:border-gray-700">
                  <button
                    onClick={() => {
                      setSelectedEmp(emp);
                      setForm({ empCode: "", password: "", email: emp.email || "" });
                      setModal("assign");
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-brand-50 hover:bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:hover:bg-brand-900/50 dark:text-brand-400 rounded-lg text-sm font-semibold transition-colors"
                  >
                    <KeyRound size={14} /> Assign ID & Pass
                  </button>
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
                Assign Credentials
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
                      className="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors"
                      placeholder="e.g. NI1234"
                      autoFocus
                    />
                  </div>
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
                  {saveLoading ? "Assigning..." : "Assign Credentials"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
