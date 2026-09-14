import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useMediclaimAuthorization } from "../hooks/useMediclaimAuthorization";
import DashboardTab from "./admin/tabs/DashboardTab";
import EmployeesTab from "./admin/tabs/EmployeesTab";
import ClaimsTab from "./admin/tabs/ClaimsTab";
import PendingReviewsTab from "./admin/tabs/PendingReviewsTab";
import PoliciesTab from "./admin/tabs/PoliciesTab";
import HospitalsTab from "./admin/tabs/HospitalsTab";
import RuleBooksTab from "./admin/tabs/RuleBooksTab";
import ReviewersTab from "./admin/tabs/ReviewersTab";
import ReportsTab from "./admin/tabs/ReportsTab";
import AuditHistoryTab from "./admin/tabs/AuditHistoryTab";

/**
 * Admin/HR Mediclaim workspace shell (F6) — same `HiringWorkspace.jsx`-style
 * pattern `EmployeeMediclaimWorkspace.jsx` already established: `?tab=` sync
 * via `useSearchParams`, a `TABS` array whose entries may optionally carry a
 * `permissions` array, `availableTabs = TABS.filter(t => !t.permissions ||
 * t.permissions.some(can))`.
 *
 * `dashboard`/`employees`/`claims`/`hospitals`/`rulebooks` are unconditional
 * because the whole workspace already sits behind `ui.admin.mediclaim.view`
 * at the route level (F2) — same reasoning `HiringWorkspace.jsx` uses for its
 * first several tabs. `pending-reviews` gates on ANY of the five stage
 * `.decide` codes (a reviewer who only holds one of the five must still be
 * able to open the tab — each row's actual decision panel is gated
 * individually inside `PendingReviewsTab`, per the implementation plan).
 */
const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "employees", label: "Employees" },
  { key: "claims", label: "Claims" },
  {
    key: "pending-reviews",
    label: "Pending Reviews",
    permissions: [
      "mediclaim.claim.manager.decide",
      "mediclaim.claim.coordinator.decide",
      "mediclaim.claim.committee.decide",
      "mediclaim.claim.hr_verification.decide",
      "mediclaim.claim.director.decide",
    ],
  },
  { key: "policies", label: "Policies", permissions: ["mediclaim.policy.read"] },
  { key: "hospitals", label: "Hospitals" },
  { key: "rulebooks", label: "Rule Books" },
  { key: "reviewers", label: "Reviewers", permissions: ["mediclaim.reviewer_assignment.read"] },
  { key: "reports", label: "Reports", permissions: ["mediclaim.report.read"] },
  { key: "audit", label: "Audit History", permissions: ["mediclaim.audit.read"] },
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 shadow-sm shadow-brand-600/30">
          <ShieldCheck size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Mediclaim Administration</h1>
          <p className="text-xs text-gray-400">
            Company-wide enrollments, claims, reviews, policies, hospitals, rule books, reviewers, reports and audit
          </p>
        </div>
      </div>

      <div className="sticky top-0 z-30 -mx-4 md:-mx-6 border-b border-gray-200 bg-gray-50/95 px-4 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95 md:px-6">
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

      {tab === "dashboard" && <DashboardTab onNavigate={selectTab} />}
      {tab === "employees" && <EmployeesTab />}
      {tab === "claims" && <ClaimsTab />}
      {tab === "pending-reviews" && <PendingReviewsTab />}
      {tab === "policies" && <PoliciesTab />}
      {tab === "hospitals" && <HospitalsTab />}
      {tab === "rulebooks" && <RuleBooksTab />}
      {tab === "reviewers" && <ReviewersTab />}
      {tab === "reports" && <ReportsTab />}
      {tab === "audit" && <AuditHistoryTab />}
    </div>
  );
}
