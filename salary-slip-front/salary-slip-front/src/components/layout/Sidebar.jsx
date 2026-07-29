/* global __APP_LABEL__ */
const APP_LABEL =
  typeof __APP_LABEL__ !== "undefined" ? __APP_LABEL__ : "Build better workplaces";

import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { useInstallPWA } from "../../hooks/useInstallPWA";
import toast from "react-hot-toast";
import {
  LayoutDashboard,
  Users,
  DollarSign,
  Receipt,
  LogOut,
  X,
  UserCircle,
  FileText,
  FileSpreadsheet,
  ClipboardList,
  ChevronRight,
  Download,
  GripVertical,
  Plus,
  ChevronLeft,
  Shield,
  ShieldCheck,
  Calendar,
  ChevronDown,
} from "lucide-react";

function getAdminNav(companyId, rawRole, isAllCompanies) {
  const nav = [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
    ...(rawRole === 0 ? [{ to: "/admin/admins", label: "Admin", icon: Shield }] : []),
    {
      label: "Employees",
      icon: Users,
      subItems: [
        { to: "/admin/employees", label: "View Employees" },
        { to: "/admin/employees/add", label: "Add Employee" }
      ]
    },
    {
      label: "Salary",
      icon: DollarSign,
      subItems: [
        { to: "/admin/salary", label: "Month & Batch Details" },
        { to: "/admin/salary/upload", label: "Salary Upload" }
      ]
    },
    {
      label: "Attendance",
      icon: Calendar,
      subItems: [
        { to: "/admin/attendance", label: "View Attendance" },
        { to: "/admin/attendance/shift", label: "Shift" }
      ]
    },
    {
      label: "Appointments",
      icon: ClipboardList,
      subItems: [
        { to: "/admin/appointments", label: "Appointment Form" },
        ...(companyId === "nidhi-impex" || isAllCompanies
          ? [{ to: "/admin/trial-form", label: "Trial Form" }]
          : []),
      ]
    },
  ];

  nav.push({
    label: "TDS",
    icon: Receipt,
    subItems: [
      { to: "/admin/tds/calculation", label: "TDS Calculation" },
      { to: "/admin/form16", label: "Form 16" },
    ]
  });

  if (rawRole === 0) {
    nav.push({
      label: "RBAC",
      icon: ShieldCheck,
      subItems: [
        { to: "/admin/rbac", label: "Dashboard" },
        { to: "/admin/rbac/users", label: "Users" },
        { to: "/admin/rbac/permission-matrix", label: "Role Permission Matrix" },
        { to: "/admin/rbac/audit-logs", label: "Audit Trails" },
      ],
    });
  }

  nav.push({ to: "/admin/profile", label: "Profile", icon: UserCircle });

  return nav;
}

const employeeNav = [
  { to: "/employee", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/employee/payslips", label: "Payslips", icon: FileText },
  { to: "/employee/form16", label: "Form 16", icon: Receipt },
  { to: "/employee/profile", label: "Profile", icon: UserCircle },
  { to: "/employee/appointment", label: "Appointment Form", icon: ClipboardList },
];

const agentNav = [
  { to: "/agent", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/agent/trial-forms", label: "Trial Form", icon: FileText, company: "nidhi-impex" },
  { to: "/agent/appointments", label: "Appointment Form", icon: Plus },
];

const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 380;

export default function Sidebar({ open, onClose, width, isCollapsed, onCollapse }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const {
    company,
    companyId,
    scopeLabel,
    isAllCompanies,
  } = useCompany();
  const { canInstall, install, showIOSGuide, dismissIOSGuide } =
    useInstallPWA();
    
  const [openMenus, setOpenMenus] = useState([]);
  
  const toggleMenu = (label) => {
    setOpenMenus(prev => 
      prev.includes(label) 
        ? prev.filter(l => l !== label)
        : [...prev, label]
    );
  };
  
  let nav = [];
  if (user?.role === "admin") {
    nav = getAdminNav(companyId, user?.rawRole, isAllCompanies);
  } else if (user?.role === "agent") {
    nav = agentNav.filter(item => {
      if (!item.company) return true;
      if (user?.company_code === 'all-companies') return true;
      if (user?.company_code?.includes(item.company)) return true;
      return false;
    });
  } else {
    const isProfileComplete = Boolean(user?.aadhar_card_no);
    nav = isProfileComplete 
      ? employeeNav 
      : employeeNav.filter(item => item.to === "/employee/profile");
  }
  
  const handleLogout = async () => {
    const result = await logout();
    if (result?.success) {
      toast.success(result.message);
    } else {
      toast.error(result?.message || "Logout failed");
    }
  };

  const handleScopeChange = (nextScope) => {
    setCompanyScope(nextScope);
    onClose?.();
  };



  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed top-0 left-0 z-30 flex h-full flex-col transition-all duration-300 ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
        style={{ width: isCollapsed ? 80 : width, backgroundColor: "var(--sidebar-bg, #111827)" }}
      >
        {/* brand accent stripe at the top */}
        <div className="h-1 w-full flex-shrink-0 bg-brand-600" />
        <div className={`flex items-center ${isCollapsed ? 'justify-center flex-col' : 'justify-between'} border-b border-gray-800 px-5 py-5`}>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand-600" title={isCollapsed ? "HRMS" : undefined}>
              <ClipboardList size={16} className="text-white" />
            </div>
            {!isCollapsed && (
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-400">
                  {APP_LABEL}
                </span>
                <span className="text-base font-semibold tracking-tight text-white">
                  HRMS
                </span>
              </div>
            )}
          </div>
          {!isCollapsed && (
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-white lg:hidden"
            >
              <X size={18} />
            </button>
          )}
          <button
            onClick={onCollapse}
            className={`p-1 text-gray-400 hover:text-white hidden lg:block ${isCollapsed ? 'mt-4' : ''}`}
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {!isCollapsed && (
          <div className="border-b border-gray-800 px-4 py-4">
            <div className="flex items-center gap-3 rounded-xl bg-gray-800 p-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                {user?.name
                  ?.split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {user?.name}
                </p>
                <p className="text-xs capitalize text-gray-400">
                  {user?.type === 'agent' ? "Agent" : user?.rawRole === 0 ? "Super Admin" : user?.rawRole === 1 ? "Admin" : user?.role}
                  {company && user?.type !== 'agent' ? ` - ${scopeLabel}` : ""}
                </p>
              </div>
            </div>
          </div>
        )}

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {nav.map(({ to, label, icon: Icon, end, subItems }) => {
            if (subItems) {
              const isOpen = openMenus.includes(label);
              const isAnyChildActive = subItems.some(subItem => {
                const targetPath = new URL(subItem.to, window.location.origin).pathname;
                const currentPath = window.location.pathname;
                return targetPath === currentPath;
              });

              return (
                <div key={label} className="space-y-1">
                  <button
                    onClick={() => toggleMenu(label)}
                    className={`w-full group flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                      isAnyChildActive ? "text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"
                    }`}
                    title={isCollapsed ? label : undefined}
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={18} className={`flex-shrink-0 ${isAnyChildActive ? "text-brand-500" : ""}`} />
                      {!isCollapsed && <span>{label}</span>}
                    </div>
                    {!isCollapsed && (
                      <ChevronDown
                        size={16}
                        className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""} ${isAnyChildActive ? "text-brand-500" : ""}`}
                      />
                    )}
                  </button>
                  {isOpen && !isCollapsed && (
                    <div className="pl-9 space-y-1 mt-1">
                      {subItems.map((subItem) => (
                        <NavLink
                          key={subItem.to}
                          to={subItem.to}
                          end
                          onClick={onClose}
                          className={({ isActive }) => {
                            const targetModal = new URL(subItem.to, window.location.origin).searchParams.get("modal");
                            const currentModal = new URLSearchParams(location.search).get("modal");
                            const trulyActive = targetModal ? currentModal === targetModal : (isActive && !currentModal);
                            
                            return `block rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                              trulyActive
                                ? "bg-brand-600 text-white shadow-md shadow-brand-600/20"
                                : "text-gray-400 hover:bg-gray-800 hover:text-white"
                            }`;
                          }}
                        >
                          {subItem.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                title={isCollapsed ? label : undefined}
                onClick={onClose}
                className={({ isActive }) => {
                  const targetModal = new URL(to, window.location.origin).searchParams.get("modal");
                  const currentModal = new URLSearchParams(location.search).get("modal");
                  const trulyActive = targetModal ? currentModal === targetModal : (isActive && !currentModal);
                  
                  return `group flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    trulyActive
                      ? "bg-brand-600 text-white shadow-lg shadow-brand-600/20"
                      : "text-gray-400 hover:bg-gray-800 hover:text-white"
                  }`;
                }}
              >
                {({ isActive }) => {
                  const targetModal = new URL(to, window.location.origin).searchParams.get("modal");
                  const currentModal = new URLSearchParams(location.search).get("modal");
                  const trulyActive = targetModal ? currentModal === targetModal : (isActive && !currentModal);
                  
                  return (
                    <>
                      <Icon size={18} className="flex-shrink-0" />
                      {!isCollapsed && <span className="flex-1">{label}</span>}
                      {trulyActive && !isCollapsed && <ChevronRight size={14} />}
                    </>
                  );
                }}
              </NavLink>
            );
          })}
        </nav>

        <div className="flex-shrink-0 border-t border-gray-800 px-4 py-3 text-center">
          <span className="text-xs font-medium text-gray-500">
            {isCollapsed ? "v1.0" : "Version 1.0"}
          </span>
        </div>
      </aside>

      {showIOSGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 pb-8"
          onClick={dismissIOSGuide}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-base font-bold text-gray-900">
              Install on iPhone / iPad
            </h3>
            <ol className="list-inside list-decimal space-y-2 text-sm text-gray-700">
              <li>
                Tap the <span className="font-semibold">Share</span> button{" "}
                <span className="text-base">Share</span> at the bottom of Safari
              </li>
              <li>
                Scroll down and tap{" "}
                <span className="font-semibold">"Add to Home Screen"</span>
              </li>
              <li>
                Tap <span className="font-semibold">Add</span> and the app icon
                will appear on your home screen
              </li>
            </ol>
            <button
              onClick={dismissIOSGuide}
              className="mt-5 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
