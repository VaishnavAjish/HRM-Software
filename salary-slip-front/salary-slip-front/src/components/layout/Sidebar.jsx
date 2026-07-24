/* global __APP_LABEL__ */
const APP_LABEL =
  typeof __APP_LABEL__ !== "undefined" ? __APP_LABEL__ : "Master Admin";

import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { ALL_COMPANY_ID } from "../../config/companyConfig";
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
  Building2,
  GripVertical,
} from "lucide-react";

function getAdminNav(companyId) {
  const nav = [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/admin/employees", label: "Employees", icon: Users },
    { to: "/admin/salary", label: "Salary", icon: DollarSign },
    { to: "/admin/appointments", label: "Appointments", icon: ClipboardList },
  ];

  if (companyId === "nidhi-impex") {
    nav.push({
      to: "/admin/trial-form",
      label: "Trial Form",
      icon: FileSpreadsheet,
    });
  }

  nav.push(
    { to: "/admin/form16", label: "Form 16", icon: Receipt },
    { to: "/admin/profile", label: "Profile", icon: UserCircle },
  );

  return nav;
}

const employeeNav = [
  { to: "/employee", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/employee/payslips", label: "Payslips", icon: FileText },
  { to: "/employee/form16", label: "Form 16", icon: Receipt },
  { to: "/employee/profile", label: "Profile", icon: UserCircle },
];

const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 380;

export default function Sidebar({ open, onClose, width, onWidthChange }) {
  const { user, logout } = useAuth();
  const {
    activeUnit,
    company,
    companyId,
    companyOptions,
    canSwitchCompany,
    isAllCompanies,
    scopeLabel,
    setCompanyScope,
  } = useCompany();
  const { canInstall, install, showIOSGuide, dismissIOSGuide } =
    useInstallPWA();
  const [isResizing, setIsResizing] = useState(false);
  const nav = user?.role === "admin" ? getAdminNav(companyId) : employeeNav;
  const allCompaniesOption = companyOptions.find(
    (option) => option.id === ALL_COMPANY_ID,
  );
  const scopedCompanyOptions = companyOptions.filter(
    (option) => option.id !== ALL_COMPANY_ID,
  );
  const activeCompanyOption = scopedCompanyOptions.find(
    (option) => option.id === companyId,
  );

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

  useEffect(() => {
    if (!isResizing) return undefined;

    const handleMouseMove = (event) => {
      const nextWidth = Math.min(
        Math.max(event.clientX, MIN_SIDEBAR_WIDTH),
        MAX_SIDEBAR_WIDTH,
      );
      onWidthChange(nextWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, onWidthChange]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed top-0 left-0 z-30 flex h-full flex-col transition-transform duration-300 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
        style={{ width, backgroundColor: "var(--sidebar-bg, #111827)" }}
      >
        {/* brand accent stripe at the top */}
        <div className="h-1 w-full flex-shrink-0 bg-brand-600" />
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
              <ClipboardList size={16} className="text-white" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-400">
                {APP_LABEL}
              </span>
              <span className="text-base font-semibold tracking-tight text-white">
                SalaryMS
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

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
                {user?.role}
                {company ? ` - ${scopeLabel}` : ""}
              </p>
            </div>
          </div>
        </div>

        {canSwitchCompany && (
          <div className="border-b border-gray-800 px-4 py-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500">
              <Building2 size={12} />
              Company Scope
            </div>

            <div className="mt-3 rounded-2xl border border-gray-800 bg-gray-900/50 p-3">
              {allCompaniesOption && (
                <button
                  onClick={() => handleScopeChange(allCompaniesOption.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                    isAllCompanies
                      ? "bg-brand-600/15 text-white ring-1 ring-brand-500/70"
                      : "bg-gray-800/60 text-gray-300 hover:bg-gray-800"
                  }`}
                >
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold ${
                      isAllCompanies
                        ? "bg-brand-600 text-white"
                        : "bg-gray-800 text-gray-200"
                    }`}
                  >
                    {allCompaniesOption.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {allCompaniesOption.sidebarLabel}
                    </p>
                    <p
                      className={`truncate text-xs ${
                        isAllCompanies ? "text-brand-200" : "text-gray-500"
                      }`}
                    >
                      {isAllCompanies ? "Combined view" : "Show both companies"}
                    </p>
                  </div>
                </button>
              )}

              <div className="mt-2 grid grid-cols-2 gap-2">
                {scopedCompanyOptions.map((option) => {
                  const companyActive =
                    !isAllCompanies && companyId === option.id;

                  return (
                    <button
                      key={option.id}
                      onClick={() =>
                        handleScopeChange({ companyId: option.id })
                      }
                      className={`rounded-xl px-3 py-3 text-left transition-all ${
                        companyActive
                          ? "bg-brand-600/15 text-white ring-1 ring-brand-500/70"
                          : "bg-gray-800/60 text-gray-300 hover:bg-gray-800"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-bold ${
                            companyActive
                              ? "bg-brand-600 text-white"
                              : "bg-gray-700 text-gray-200"
                          }`}
                        >
                          {option.initials}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {option.sidebarLabel}
                          </p>
                          <p
                            className={`truncate text-[11px] ${
                              companyActive ? "text-brand-200" : "text-gray-500"
                            }`}
                          >
                            {option.units?.length || 0} branches
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {!isAllCompanies && activeCompanyOption?.units?.length > 0 && (
                <div className="mt-3 border-t border-gray-800 pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Branches
                    </p>
                    <button
                      onClick={() =>
                        handleScopeChange({ companyId: activeCompanyOption.id })
                      }
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                        !activeUnit
                          ? "bg-brand-600 text-white"
                          : "bg-gray-800 text-gray-400 hover:text-white"
                      }`}
                    >
                      All Branches
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {activeCompanyOption.units.map((unit) => {
                      const unitSelected = activeUnit === unit;

                      return (
                        <button
                          key={unit}
                          onClick={() =>
                            handleScopeChange({
                              companyId: activeCompanyOption.id,
                              unit,
                            })
                          }
                          className={`rounded-xl px-3 py-2 text-left text-sm font-medium transition-all ${
                            unitSelected
                              ? "bg-brand-600 text-white"
                              : "bg-gray-800/60 text-gray-300 hover:bg-gray-800 hover:text-white"
                          }`}
                        >
                          {unit}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-brand-600 text-white shadow-lg shadow-brand-600/20"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={18} className="flex-shrink-0" />
                  <span className="flex-1">{label}</span>
                  {isActive && <ChevronRight size={14} />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-gray-800 px-3 py-4">
          {canInstall && (
            <button
              onClick={install}
              className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-brand-400 transition-all hover:bg-brand-600/20 hover:text-white"
            >
              <Download size={18} />
              Install App
            </button>
          )}
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-400 transition-all hover:bg-red-600/20 hover:text-red-400"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>

        <button
          type="button"
          aria-label="Resize sidebar"
          onMouseDown={(event) => {
            event.preventDefault();
            setIsResizing(true);
          }}
          title="Drag to resize sidebar"
          className={`absolute right-0 top-10 hidden h-16 w-5 -translate-y-1/2 translate-x-1/2 cursor-col-resize touch-none items-center justify-center rounded-full border border-brand-500/30 bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-md shadow-brand-500/20 transition-all duration-200 ease-out hover:scale-110 hover:border-brand-400 hover:from-brand-400 hover:to-brand-500 hover:shadow-lg hover:shadow-brand-500/40 active:scale-95 lg:flex ${
            isResizing
              ? "scale-110 border-brand-400 from-brand-400 to-brand-500 shadow-lg shadow-brand-500/50"
              : ""
          }`}
        >
          <GripVertical size={14} aria-hidden="true" />
          <span className="sr-only">Drag to resize sidebar</span>
        </button>
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
