import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ChevronDown, ChevronRight, LogOut, UserCircle, LifeBuoy } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useNavItems, dashboardPathFor } from "./useNavItems";

/*
 * Nav widths as CSS lengths rather than raw numbers.
 *
 * They were 68 and 260, applied as `${n}px`, which left the nav at its original
 * size while the rest of the UI followed the global scale — the one part of the
 * shell that would not shrink. Reading the rem-based tokens instead means the
 * nav rides --ui-scale like everything else, and AppLayout's matching
 * padding-left resolves from the same variables so the two cannot drift.
 */
export const RAIL_WIDTH = "var(--app-nav-rail-width)";
export const EXPANDED_WIDTH = "var(--app-nav-expanded-width)";

function itemKey(item, index) {
  return item.to ?? item.label ?? `item-${index}`;
}

function isItemActive(item, pathname) {
  if (item.to) {
    return item.end ? pathname === item.to : pathname.startsWith(item.to);
  }
  return (item.subItems ?? []).some((sub) => {
    return sub.end ? pathname === sub.to : pathname.startsWith(sub.to);
  });
}

export default function EnterpriseNav({ onFlyoutChange }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const nav = useNavItems();

  const [isHovered, setIsHovered] = useState(false);
  const [openMenus, setOpenMenus] = useState([]);
  const hoverTimerRef = useRef(null);

  // Sync active section ONLY when location.pathname changes
  useEffect(() => {
    const activeParent = nav.find(
      (item) => item.subItems && isItemActive(item, location.pathname)
    );
    if (activeParent) {
      setOpenMenus((prev) => (prev.includes(activeParent.label) ? prev : [activeParent.label]));
    }
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (onFlyoutChange) {
      onFlyoutChange(isHovered);
    }
  }, [isHovered, onFlyoutChange]);

  const handleMouseEnter = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 200);
  }, []);

  // Toggle open/close for any accordion category
  const toggleMenu = (label) => {
    setOpenMenus((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const dashboardPath = dashboardPathFor(user);

  return (
    <aside
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-label="Sidebar navigation"
      className="fixed inset-y-0 left-0 z-40 flex flex-col border-r border-gray-800 bg-gray-900 text-gray-200 shadow-2xl transition-[width] duration-300 ease-in-out font-sans overflow-hidden"
      style={{ width: isHovered ? EXPANDED_WIDTH : RAIL_WIDTH }}
    >
      {/* Top Brand Header */}
      <div className="flex h-16 items-center px-4 border-b border-gray-800 flex-shrink-0">
        <Link
          to={dashboardPath}
          aria-label="Home"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white shadow-md flex-shrink-0"
        >
          {(user?.name ?? "N").slice(0, 2).toUpperCase()}
        </Link>

        <div
          className={`flex flex-col justify-center overflow-hidden transition-all duration-300 ease-in-out ${
            isHovered ? "max-w-[180px] opacity-100 ml-3" : "max-w-0 opacity-0 ml-0 pointer-events-none"
          }`}
        >
          <span className="block text-sm font-bold text-white tracking-tight whitespace-nowrap">
            NISS HRMS
          </span>
          <span className="block text-[11px] font-medium text-brand-400 whitespace-nowrap">
            Enterprise Portal
          </span>
        </div>
      </div>

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2.5 space-y-1">
        {nav.map((item, index) => {
          const Icon = item.icon ?? UserCircle;
          const active = isItemActive(item, location.pathname);
          const isMenuOpen = openMenus.includes(item.label);

          if (item.subItems) {
            return (
              <div key={itemKey(item, index)} className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleMenu(item.label)}
                  className={`group relative flex h-11 w-full items-center rounded-xl px-2.5 text-sm font-medium transition-colors focus:outline-none ${
                    active
                      ? "text-white bg-gray-800/80 font-semibold"
                      : "text-gray-400 hover:bg-gray-800 hover:text-white"
                  }`}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0">
                    <Icon size={18} className={active ? "text-brand-500" : ""} />
                  </span>

                  <div
                    className={`flex flex-1 items-center justify-between overflow-hidden transition-all duration-300 ease-in-out ${
                      isHovered ? "max-w-[180px] opacity-100 ml-3" : "max-w-0 opacity-0 ml-0 pointer-events-none"
                    }`}
                  >
                    <span className="truncate text-sm font-medium text-gray-200 whitespace-nowrap">
                      {item.label}
                    </span>
                    <ChevronDown
                      size={16}
                      className={`flex-shrink-0 transition-transform duration-200 ${
                        isMenuOpen ? "rotate-180" : ""
                      } ${active ? "text-brand-500" : "text-gray-400"}`}
                    />
                  </div>

                  {!isHovered && (
                    <div
                      role="tooltip"
                      className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 hidden items-center whitespace-nowrap rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-white shadow-xl border border-gray-700 group-hover:flex z-50"
                    >
                      {item.label}
                    </div>
                  )}
                </button>

                {/* Sub-menu Dropdown List */}
                {isMenuOpen && (
                  <div
                    className={`pl-10 space-y-1 overflow-hidden transition-all duration-300 ease-in-out ${
                      isHovered ? "max-h-96 opacity-100 py-1" : "max-h-0 opacity-0 pointer-events-none py-0"
                    }`}
                  >
                    {item.subItems.map((sub) => {
                      return (
                        <NavLink
                          key={sub.to}
                          to={sub.to}
                          end={sub.end}
                          className={({ isActive }) =>
                            `block rounded-lg px-3 py-2 text-sm font-medium transition-all whitespace-nowrap ${
                              isActive
                                ? "bg-brand-600 text-white shadow-md shadow-brand-600/20 font-semibold"
                                : "text-gray-400 hover:bg-gray-800 hover:text-white"
                            }`
                          }
                        >
                          {sub.label}
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <NavLink
              key={itemKey(item, index)}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `group relative flex h-11 w-full items-center rounded-xl px-2.5 text-sm font-medium transition-colors focus:outline-none ${
                  isActive
                    ? "bg-brand-600 text-white shadow-md shadow-brand-600/20 font-semibold"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0">
                    <Icon size={18} className={isActive ? "text-white" : ""} />
                  </span>

                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      isHovered ? "max-w-[180px] opacity-100 ml-3" : "max-w-0 opacity-0 ml-0 pointer-events-none"
                    }`}
                  >
                    <span className="truncate text-sm font-medium text-gray-200 whitespace-nowrap">
                      {item.label}
                    </span>
                  </div>

                  {!isHovered && (
                    <div
                      role="tooltip"
                      className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 hidden items-center whitespace-nowrap rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-white shadow-xl border border-gray-700 group-hover:flex z-50"
                    >
                      {item.label}
                    </div>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </div>

      {/* Bottom Footer */}
      <div className="border-t border-gray-800 py-3 px-3 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-semibold text-gray-400 whitespace-nowrap transition-all">
          {isHovered ? "Version 1.2" : "v1.2"}
        </span>
      </div>
    </aside>
  );
}
