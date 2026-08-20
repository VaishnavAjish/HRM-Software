/* global __APP_LABEL__ */
const APP_LABEL =
  typeof __APP_LABEL__ !== "undefined" ? __APP_LABEL__ : "NISS HRMS";

import { Link, NavLink, useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { useInstallPWA } from "../../hooks/useInstallPWA";
import { useNavItems } from "./useNavItems";
import {
  X,
  ClipboardList,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
} from "lucide-react";


export default function Sidebar({ open, onClose, width, isCollapsed, onCollapse }) {
  const { user } = useAuth();
  const location = useLocation();
  const { company, scopeLabel } = useCompany();
  const { showIOSGuide, dismissIOSGuide } =
    useInstallPWA();

  const [openMenus, setOpenMenus] = useState([]);
  
  const toggleMenu = (label) => {
    setOpenMenus(prev => 
      prev.includes(label) 
        ? prev.filter(l => l !== label)
        : [...prev, label]
    );
  };
  
  /*
   * The same navigation the desktop rail renders.
   *
   * This drawer used to carry its own copy of the menu, gated on legacy
   * business codes, while the rail resolved each entry through the registry
   * code that governs its route. Two authorization implementations for one
   * menu drift by construction: a page denied in the Permission Matrix
   * disappeared from the desktop rail and stayed in the mobile drawer, so the
   * same account saw a different menu depending on the width of its screen.
   */
  const nav = useNavItems();

  const dashboardPath =
    user?.role === "admin" ? "/admin" : user?.role === "agent" ? "/agent" : "/employee";

  // handleLogout removed


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
          <Link to={dashboardPath} onClick={onClose} className="flex items-center gap-3">
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
          </Link>
          {!isCollapsed && (
            <button
              onClick={onClose}
              aria-label="Close navigation menu"
              className="p-1 text-gray-400 hover:text-white lg:hidden"
            >
              <X size={18} aria-hidden="true" />
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

        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-4">
          {nav.map(({ to, label, icon: Icon, end, subItems, disabled }) => {
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
                      {subItems.map((subItem) => subItem.disabled ? (
                        <span
                          key={subItem.to}
                          aria-disabled="true"
                          title="You do not have access to this page"
                          className="block cursor-not-allowed rounded-lg px-3 py-2 text-sm font-medium text-gray-600 opacity-60"
                        >
                          {subItem.label}
                        </span>
                      ) : (
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
                      ),
                      )}
                    </div>
                  )}
                </div>
              );
            }

            if (disabled) {
              return (
                <span
                  key={to}
                  aria-disabled="true"
                  title="You do not have access to this page"
                  className={`group flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} cursor-not-allowed rounded-xl px-3 py-2.5 text-sm font-medium text-gray-600 opacity-60`}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  {!isCollapsed && <span className="flex-1">{label}</span>}
                </span>
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
          <span className="text-xs font-medium text-gray-400">
            {isCollapsed ? "v1.2" : "Version 1.2"}
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
