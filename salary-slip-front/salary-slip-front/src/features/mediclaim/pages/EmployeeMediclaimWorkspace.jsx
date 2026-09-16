import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ShieldCheck, Clock } from "lucide-react";
import { useMediclaimLookups } from "../hooks/useMediclaimLookups";
import { formatClaimDate } from "../utils/formatters";
import { useMediclaimAuthorization } from "../hooks/useMediclaimAuthorization";
import MyCoverageTab from "./employee/tabs/MyCoverageTab";
import FamilyMembersTab from "./employee/tabs/FamilyMembersTab";
import CardsTab from "./employee/tabs/CardsTab";
import NotifyOfficeTab from "./employee/tabs/NotifyOfficeTab";
import SubmitClaimTab from "./employee/tabs/SubmitClaimTab";
import MyClaimsTab from "./employee/tabs/MyClaimsTab";
import HospitalsTab from "./employee/tabs/HospitalsTab";
import RuleBookTab from "./employee/tabs/RuleBookTab";
import HistoryTab from "./employee/tabs/HistoryTab";
import TeamClaimsTab from "./employee/tabs/TeamClaimsTab";
import PendingMyApprovalTab from "./employee/tabs/PendingMyApprovalTab";

/**
 * Employee Mediclaim workspace shell — title, sticky tab bar, then whichever
 * tab is active. Mirrors `HiringWorkspace.jsx`'s exact pattern: `?tab=` sync
 * via `useSearchParams`, a `TABS` array whose entries may optionally carry a
 * `permissions` array, `availableTabs = TABS.filter(t => !t.permissions ||
 * t.permissions.some(can))`.
 *
 * Every F3/F4 tab here is unconditional — the whole workspace already sits
 * behind the route-level `ui.admin.mediclaim.view` / `canRoute()` check
 * added in F2, so none of these read-only or self-service tabs needs its
 * own permission gate. `team` and `pending` (F5) are the only two tabs in
 * this workspace that carry a `permissions` array: Team Claims and Pending
 * My Approval are manager-facing, not available to every employee, so they
 * gate on `mediclaim.team_claim.read` / `mediclaim.claim.manager.decide`
 * respectively via the same `TABS.filter(t => !t.permissions ||
 * t.permissions.some(can))` mechanism `HiringWorkspace.jsx` uses.
 */
const TABS = [
  { key: "coverage", label: "My Coverage" },
  { key: "family", label: "Family Members" },
  { key: "rulebook", label: "Rule Book" },
  { key: "cards", label: "Cards" },
  { key: "notify", label: "Notify Office" },
  { key: "submit", label: "Submit Claim" },
  { key: "claims", label: "My Claims" },
  { key: "hospitals", label: "Hospitals" },
  { key: "history", label: "History" },
  { key: "team", label: "Team Claims", permissions: ["mediclaim.team_claim.read"] },
  { key: "pending", label: "Pending My Approval", permissions: ["mediclaim.claim.manager.decide"] },
];

// Until onboarding is complete, the tab bar is cut down to just these two
// (rule book first) — no other tab shows at all. Same TABS entries, just a
// fixed order/subset, so the tab bar renders exactly like any other tab
// state instead of a separate full-page flow.
//
// Deliberately rule-book-then-family here even though `TABS` above lists
// family before rule book once onboarding is complete: the employee must
// read the rule book before the family-details form unlocks (see
// `FamilyMembersTab.jsx`'s own gate), so the *required order* and the
// *steady-state tab position* are two different, independently-set things —
// don't "fix" this order to match `TABS`.
const ONBOARDING_TAB_KEYS = ["rulebook", "family"];

function WorkspaceHeader() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 shadow-sm shadow-brand-600/30">
        <ShieldCheck size={18} className="text-white" />
      </div>
      <div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">Mediclaim</h1>
        <p className="text-xs text-gray-400">Coverage, family members, cards, hospitals and claim history</p>
      </div>
    </div>
  );
}

function WaitingPeriodLock({ eligibility }) {
  const days = eligibility?.days_remaining ?? eligibility?.daysRemaining ?? 0;
  const eligibleFrom = eligibility?.eligible_from ?? eligibility?.eligibleFrom;
  const months = eligibility?.waiting_period_months ?? eligibility?.waitingPeriodMonths ?? 3;

  return (
    <div className="space-y-4">
      <WorkspaceHeader />

      <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white px-6 py-16 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
          <Clock size={22} />
        </div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Mediclaim isn't available yet</h2>
        <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
          Coverage begins {months} month{months === 1 ? "" : "s"} after your joining date, per the policy rule book.
        </p>
        <div className="mt-2 rounded-xl bg-gray-50 px-5 py-3 dark:bg-gray-700/40">
          <p className="text-2xl font-bold text-brand-600 dark:text-brand-400">
            {days > 0 ? `${days} day${days === 1 ? "" : "s"}` : "Available now"}
          </p>
          {eligibleFrom && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {days > 0 ? `remaining — unlocks on ${formatClaimDate(eligibleFrom)}` : `since ${formatClaimDate(eligibleFrom)}`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EmployeeMediclaimWorkspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const lookups = useMediclaimLookups();
  const { can } = useMediclaimAuthorization();

  // `null` (the /me/coverage call failed) fails open — a transient error
  // never locks anyone out — but `undefined` (the *first* load, still in
  // flight) is handled separately below with its own loading state instead
  // of folding into this "already onboarded" default: doing it here instead
  // briefly rendered every tab and then yanked most of them away the moment
  // the real answer arrived, which is the flash this whole gate exists to
  // avoid in the first place.
  const onboardingComplete = lookups.onboarding === null || Boolean(lookups.onboarding?.completed);

  const availableTabs = useMemo(() => {
    const permitted = TABS.filter((item) => !item.permissions || item.permissions.some((p) => can(p)));
    if (onboardingComplete) return permitted;
    return ONBOARDING_TAB_KEYS
      .map((key) => permitted.find((item) => item.key === key))
      .filter(Boolean);
  }, [can, onboardingComplete]);

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

  // The very first /me/coverage response decides both the eligibility lock
  // below and which tabs are even offered — render nothing dependent on
  // either until it actually lands, rather than showing every tab and then
  // pulling most of them away (or locking the whole screen) a moment later.
  if (lookups.onboarding === undefined) {
    return (
      <div className="space-y-4">
        <WorkspaceHeader />
        <p className="py-16 text-center text-sm text-gray-400">Loading…</p>
      </div>
    );
  }

  // `eligibility` null if the check itself failed (fail-open, same "unknown
  // reads as available" convention `useModuleAvailability` already uses
  // elsewhere) — only an explicit `eligible: false` locks.
  if (lookups.eligibility && lookups.eligibility.eligible === false) {
    return <WaitingPeriodLock eligibility={lookups.eligibility} />;
  }

  return (
    <div className="space-y-4">
      <WorkspaceHeader />

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

      {tab === "coverage" && <MyCoverageTab />}
      {tab === "family" && <FamilyMembersTab lookups={lookups} onboarding={lookups.onboarding} />}
      {tab === "cards" && <CardsTab />}
      {tab === "notify" && <NotifyOfficeTab lookups={lookups} />}
      {tab === "submit" && <SubmitClaimTab lookups={lookups} />}
      {tab === "claims" && <MyClaimsTab />}
      {tab === "hospitals" && <HospitalsTab lookups={lookups} />}
      {tab === "rulebook" && <RuleBookTab lookups={lookups} onboarding={lookups.onboarding} />}
      {tab === "history" && <HistoryTab />}
      {tab === "team" && <TeamClaimsTab />}
      {tab === "pending" && <PendingMyApprovalTab />}
    </div>
  );
}
