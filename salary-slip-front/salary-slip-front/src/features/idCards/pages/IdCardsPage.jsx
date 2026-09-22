import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  CreditCard,
  Search,
  Filter,
  Download,
  Printer,
  Eye,
  SlidersHorizontal,
  Loader2,
  Building,
  UserCheck,
  Sparkles,
  QrCode,
  ShieldCheck,
} from "lucide-react";
import toast from "react-hot-toast";
import html2canvas from "html2canvas";
import { useAuth } from "../../../context/AuthContext";
import { useCompany } from "../../../context/CompanyContext";
import { salaryApi } from "../../../utils/api";
import { getCompanyConfig } from "../../../config/companyConfig";
import Modal from "../../../components/ui/Modal";
import EmployeeIDCard from "../components/EmployeeIDCard";
import IDCardDesigner from "../components/IDCardDesigner";
import { getIDCardTheme } from "../config/idCardThemes";

// Default demo employee if database loading or empty response
const DEMO_EMPLOYEE = {
  id: "demo-1",
  name: "Vansh Chauhan",
  empCode: "NI00123",
  designation: "AI / ML Engineer",
  department: "Technology",
  unit: "Ichhapore",
  companyId: "nidhi-impex",
  companyLabel: "Nidhi Impex",
  joiningDate: "15 Sep 2026",
  bloodGroup: "B+",
  status: "Active",
};

export default function IdCardsPage() {
  const { user } = useAuth();
  const { companyId: activeCompanyId } = useCompany();

  const [employees, setEmployees] = useState([DEMO_EMPLOYEE]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("directory"); // 'directory' | 'designer'
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCompany, setSelectedCompany] = useState(activeCompanyId || "all");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("Active");

  // Selected Employee & Preview Modal
  const [selectedEmployee, setSelectedEmployee] = useState(DEMO_EMPLOYEE);
  const [previewModal, setPreviewModal] = useState({ open: false, side: "both" });
  const [designerCompanyId, setDesignerCompanyId] = useState("nidhi-impex");
  const modalCardRef = useRef(null);
  const [modalDownloading, setModalDownloading] = useState(false);

  // Fetch employees from API
  useEffect(() => {
    let active = true;
    setLoading(true);

    salaryApi
      .getAllEmployees(user?.accessToken, user?.tokenType, { status: "Active", per_page: 500 }, activeCompanyId)
      .then((res) => {
        if (!active) return;
        const list = res?.data || res || [];
        if (Array.isArray(list) && list.length > 0) {
          const mapped = list.map((emp) => ({
            id: emp.id,
            name: emp.name || emp.displayName || "Employee",
            empCode: String(emp.emp_code || emp.empCode || "EMP-001"),
            designation: emp.designation || emp.position_title || emp.position || "Staff",
            department: emp.department || "General",
            unit: emp.unit || emp.branch || "Head Office",
            companyId: emp.company_code || emp.companyId || "nidhi-impex",
            companyLabel: getCompanyConfig(emp.company_code)?.label || "Nidhi Impex",
            joiningDate: emp.joining_date || emp.date_of_joining || "01 Jan 2026",
            bloodGroup: emp.blood_group || emp.bloodGroup || "O+",
            photo: emp.photo || emp.image || emp.profile_photo,
            status: String(emp.status) === "0" || emp.status === "Active" ? "Active" : "Inactive",
          }));
          setEmployees(mapped);
          setSelectedEmployee(mapped[0]);
          setDesignerCompanyId(mapped[0].companyId);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user?.accessToken, user?.tokenType, activeCompanyId]);

  // Filtered employee list
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          (emp.name && emp.name.toLowerCase().includes(q)) ||
          (emp.empCode && emp.empCode.toLowerCase().includes(q)) ||
          (emp.department && emp.department.toLowerCase().includes(q)) ||
          (emp.designation && emp.designation.toLowerCase().includes(q));
        if (!match) return false;
      }
      if (selectedCompany !== "all") {
        if (String(emp.companyId).toLowerCase() !== String(selectedCompany).toLowerCase()) {
          return false;
        }
      }
      if (selectedDepartment) {
        if ((emp.department || "").toLowerCase() !== selectedDepartment.toLowerCase()) {
          return false;
        }
      }
      if (selectedStatus) {
        if (emp.status !== selectedStatus) return false;
      }
      return true;
    });
  }, [employees, searchQuery, selectedCompany, selectedDepartment, selectedStatus]);

  // Departments list for dropdown filter
  const departmentOptions = useMemo(() => {
    const set = new Set();
    employees.forEach((e) => e.department && set.add(e.department));
    return Array.from(set);
  }, [employees]);

  const openPreview = (emp) => {
    setSelectedEmployee(emp);
    setPreviewModal({ open: true, side: "both" });
  };

  const openDesignerFor = (emp) => {
    setSelectedEmployee(emp);
    setDesignerCompanyId(emp.companyId.includes("silver") ? "silver-star" : "nidhi-impex");
    setActiveTab("designer");
  };

  const downloadModalCard = async () => {
    if (!modalCardRef.current) return;
    setModalDownloading(true);
    try {
      const canvas = await html2canvas(modalCardRef.current, { scale: 3, useCORS: true });
      const link = document.createElement("a");
      const nameBase = (selectedEmployee.name || "pass").replace(/[^a-z0-9]/gi, "-").toLowerCase();
      link.download = `id-card-${nameBase}.png`;
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Downloaded ID Card PNG!");
    } catch {
      toast.error("Failed to download image.");
    } finally {
      setModalDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div>
          <h1 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2 tracking-tight">
            <CreditCard className="text-indigo-600 dark:text-indigo-400" size={24} />
            Employee ID Cards
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Create, preview, customize and print corporate employee identification passes.
          </p>
        </div>

        {/* Tab switcher header buttons */}
        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 p-1.5 rounded-xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("directory")}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === "directory"
                ? "bg-white text-indigo-600 shadow-sm dark:bg-gray-800 dark:text-indigo-400"
                : "text-gray-600 hover:text-gray-900 dark:text-gray-300"
            }`}
          >
            <UserCheck size={15} /> Card Directory
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("designer")}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === "designer"
                ? "bg-white text-indigo-600 shadow-sm dark:bg-gray-800 dark:text-indigo-400"
                : "text-gray-600 hover:text-gray-900 dark:text-gray-300"
            }`}
          >
            <SlidersHorizontal size={15} /> Live Customizer
          </button>
        </div>
      </div>

      {/* Directory Tab View */}
      {activeTab === "directory" && (
        <div className="space-y-4">
          {/* Search & Filter Toolbar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            {/* Search Box */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Search name, ID, title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Company Selector */}
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Companies</option>
              <option value="nidhi-impex">Nidhi Impex</option>
              <option value="silver-star">Silver Star</option>
            </select>

            {/* Department Filter */}
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Departments</option>
              {departmentOptions.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="Active">Active Only</option>
              <option value="">All Statuses</option>
            </select>
          </div>

          {/* Cards Grid */}
          {loading ? (
            <div className="flex h-64 items-center justify-center bg-white rounded-xl border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
              <Loader2 className="animate-spin text-indigo-600" size={28} />
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-gray-200 dark:bg-gray-800 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-xs">
              No employees match the specified filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredEmployees.map((emp) => {
                const isNidhi = !String(emp.companyId).toLowerCase().includes("silver");
                return (
                  <div
                    key={emp.id}
                    className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span
                          className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                            isNidhi ? "bg-amber-100 text-amber-900" : "bg-orange-100 text-orange-900"
                          }`}
                        >
                          {isNidhi ? "Nidhi Impex" : "Silver Star"}
                        </span>
                        <span className="text-[10px] font-mono font-bold text-gray-400">{emp.empCode}</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-slate-100 to-indigo-50 border border-gray-200 flex items-center justify-center font-bold text-slate-700 text-base flex-shrink-0">
                          {emp.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-xs font-black text-gray-900 dark:text-white truncate">{emp.name}</h3>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{emp.designation}</p>
                          <p className="text-[9px] text-indigo-600 dark:text-indigo-400 font-semibold truncate">
                            {emp.department} • {emp.unit}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => openPreview(emp)}
                        className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-[11px] font-bold text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                      >
                        <Eye size={13} className="text-indigo-600" /> Preview
                      </button>

                      <button
                        type="button"
                        onClick={() => openDesignerFor(emp)}
                        className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 text-[11px] font-bold text-white hover:bg-indigo-700"
                      >
                        <SlidersHorizontal size={13} /> Customize
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Designer Customizer View */}
      {activeTab === "designer" && (
        <IDCardDesigner
          employee={selectedEmployee}
          selectedCompanyId={designerCompanyId}
          onSelectCompany={(id) => setDesignerCompanyId(id)}
        />
      )}

      {/* Quick Preview Modal */}
      <Modal
        isOpen={previewModal.open}
        onClose={() => setPreviewModal({ open: false, side: "both" })}
        title={`${selectedEmployee.name}'s Corporate ID Card`}
        size="md"
      >
        <div className="flex flex-col items-center gap-4 py-3">
          <div className="overflow-x-auto max-w-full p-2">
            <EmployeeIDCard
              cardRef={modalCardRef}
              employee={selectedEmployee}
              companyConfig={getIDCardTheme(designerCompanyId || selectedEmployee.companyId)}
              side={previewModal.side}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-700 hover:bg-gray-50 shadow-sm"
            >
              <Printer size={14} /> Print Card
            </button>
            <button
              type="button"
              onClick={downloadModalCard}
              disabled={modalDownloading}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 text-xs font-bold text-white hover:bg-indigo-700 shadow-sm disabled:opacity-50"
            >
              {modalDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download PNG
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
