import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useMediclaimAuthorization } from "../hooks/useMediclaimAuthorization";
import DashboardTab from "./admin/tabs/DashboardTab";
import EmployeesTab from "./admin/tabs/EmployeesTab";
import PendingReviewsTab from "./admin/tabs/PendingReviewsTab";
import SettingsTab from "./admin/tabs/SettingsTab";
import ReportsTab from "./admin/tabs/ReportsTab";

/**
 * Admin/HR Mediclaim workspace shell (F6) — same `HiringWorkspace.jsx`-style
 * pattern `EmployeeMediclaimWorkspace.jsx` already established: `?tab=` sync
 * via `useSearchParams`, a `TABS` array whose entries may optionally carry a
 * `permissions` array, `availableTabs = TABS.filter(t => !t.permissions ||
 * t.permissions.some(can))`.
 *
 * Rule Books, Hospitals and Document Requirements are no longer separate
 * top-level tabs — they're combined into one "Settings" tab
 * (`SettingsTab.jsx`), a left-nav/right-content settings-page layout rather
 * than three tabs or a popup/drawer per section. Policies has been removed
 * from this workspace entirely (no UI reaches it).
 *
 * `dashboard`/`employees`/`claims`/`settings` are unconditional because the
 * whole workspace already sits behind `ui.admin.mediclaim.view` at the route
 * level (F2) — same reasoning `HiringWorkspace.jsx` uses for its first
 * several tabs (fine-grained gating of Document Requirements within
 * `SettingsTab` itself, same as Rule Books/Hospitals were always
 * unconditional here). `pending-reviews` gates on ANY of the six stage
 * `.decide`/`.create` codes (five review stages plus Settlement — a
 * reviewer who only holds one must still be able to open the tab — each
 * row's actual decision panel is gated individually inside
 * `PendingReviewsTab`, per the implementation plan).
 */
const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "employees", label: "Employees" },
  {
    key: "claims",
    label: "Claims",
    permissions: [
      "mediclaim.claim.approve",
      "mediclaim.claim.manager.decide",
      "mediclaim.claim.coordinator.decide",
      "mediclaim.claim.committee.decide",
      "mediclaim.claim.hr_verification.decide",
      "mediclaim.claim.director.decide",
      "mediclaim.settlement.create",
    ],
  },
  { key: "settings", label: "Settings" },
  { key: "reports", label: "Reports", permissions: ["mediclaim.report.read"] },
];

export default function AdminMediclaimWorkspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { can } = useMediclaimAuthorization();

  const availableTabs = useMemo(
    () => TABS.filter((item) => !item.permissions || item.permissions.some((p) => can(p))),
    [can],
  );

  const rawTab = searchParams.get("tab");
  const tab = availableTabs.some((item) => item.key === rawTab) ? rawTab : availableTabs[0]?.key;

  useEffect(() => {
    const currentTab = searchParams.get("tab");
    if (tab && currentTab !== tab) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("tab", tab);
        return next;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams, tab]);

  const selectTab = (key) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("tab", key);
      return next;
    });
  };

  // Employees is the one tab built to fill the page like `AddEmployeePage.jsx`
  // (`EmployeesTab.jsx`'s own root + `ClaimsTable`'s `fillHeight` prop) —
  // this needs a real bounded height to flex against, all the way up from
  // `AppLayout.jsx`'s `h-full` Outlet slot. Every other tab here still relies
  // on the normal page-level scroll (`<main>` in AppLayout), so the
  // full-height/overflow-hidden treatment is applied only while that tab is
  // selected — switching tabs never risks clipping content nobody has
  // verified fits in a fixed box.
  const isFullHeightTab = tab === "employees";

  return (
    <div className={`flex h-full min-h-0 flex-col gap-4 ${isFullHeightTab ? "overflow-hidden" : ""}`}>
      <div className="sticky top-0 z-30 -mx-4 md:-mx-6 shrink-0 border-b border-gray-200 bg-gray-50/95 px-4 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95 md:px-6">
        <div className="scrollbar-hide flex gap-1 overflow-x-auto">
          {availableTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => selectTab(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                tab === t.key
                  ? "border-brand-600 text-brand-600 dark:text-brand-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className={isFullHeightTab ? "flex-1 min-h-0 flex flex-col overflow-hidden" : ""}>
        {tab === "dashboard" && <DashboardTab onNavigate={selectTab} />}
        {tab === "employees" && <EmployeesTab />}
        {(tab === "claims" || tab === "pending-reviews") && <PendingReviewsTab />}
        {tab === "settings" && <SettingsTab />}
        {tab === "reports" && <ReportsTab />}
      </div>
    </div>
  );
}
