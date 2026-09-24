import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ShieldCheck, Clock } from "lucide-react";
import { useMediclaimLookups } from "../hooks/useMediclaimLookups";
import { formatClaimDate } from "../utils/formatters";
import { useMediclaimAuthorization } from "../hooks/useMediclaimAuthorization";
import MediclaimInfoTab from "./employee/tabs/MediclaimInfoTab";
import FamilyMembersTab from "./employee/tabs/FamilyMembersTab";
import MyClaimsTab from "./employee/tabs/MyClaimsTab";
import RuleBookTab from "./employee/tabs/RuleBookTab";
import TeamClaimsTab from "./employee/tabs/TeamClaimsTab";

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
 * own permission gate. `team` is the only tab in this workspace that
 * carries a `permissions` array: Team Claims is manager-facing, not
 * available to every employee, so it gates on `mediclaim.team_claim.read`
 * via the same `TABS.filter(t => !t.permissions || t.permissions.some(can))`
 * mechanism `HiringWorkspace.jsx` uses.
 *
 * "Pending My Approval" (the old per-claim manager-decision queue) was
 * removed outright: the simplified claim workflow (see
 * `ClaimWorkflowService::approveDirect()` on the backend) replaced the
 * manager-review stage with a single fixed-role approval step handled
 * entirely from the admin "Pending Reviews" tab, so there is no longer
 * anything for an individual manager to decide here.
 *
 * "Cards", "Hospitals" and the standalone "Rule Book" tab were folded into
 * the renamed "Mediclaim Info" tab (`MediclaimInfoTab.jsx`) so everything
 * about the employee's policy lives on one page instead of four separate
 * tabs. "Notify Office" was removed outright. "Submit Claim" was ALSO
 * removed as its own tab — filing a claim is now a "New Claim Request"
 * button inside "My Claims" (`MyClaimsTab.jsx`), which opens a single popup
 * form instead of a separate multi-step draft wizard tab. "History" was
 * removed too — "My Claims" already shows every claim (any status) in one
 * table, so a separate closed/settled-only tab was pure duplication.
 * "rulebook" stays in this TABS array (see `availableTabs` below) purely so
 * the onboarding gate can still find it; it is never shown as its own tab
 * button once onboarding is complete.
 */
const TABS = [
  { key: "coverage", label: "Mediclaim Info" },
  { key: "family", label: "Family Members" },
  { key: "rulebook", label: "Rule Book" },
  { key: "claims", label: "My Claims" },
  { key: "team", label: "Team Claims", permissions: ["mediclaim.team_claim.read"] },
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
  return null;
}

function WaitingPeriodLock({ eligibility }) {
  const days = eligibility?.days_remaining ?? eligibility?.daysRemaining ?? 0;
  const eligibleFrom = eligibility?.eligible_from ?? eligibility?.eligibleFrom;
  const months = eligibility?.waiting_period_months ?? eligibility?.waitingPeriodMonths ?? 3;
  const reason = eligibility?.reason;

  // Distinct from a real waiting period: HR hasn't filled in this
  // employee's joining date at all, so how long they've actually worked
  // here — and therefore whether they've cleared the waiting period — is
  // genuinely unknown. Showing a countdown here would just be a guess
  // (this used to silently guess `0 days remaining`, wrongly unlocking
  // day-one hires) — the honest thing is to say so plainly and point at
  // the actual fix (HR adding the date), not fabricate a number.
  if (reason === "missing_joining_date") {
    return (
      <div className="space-y-4">
        <WorkspaceHeader />

        <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white px-6 py-16 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
            <Clock size={22} />
          </div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Mediclaim isn't available yet</h2>
          <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
            Your joining date isn't on file yet, so we can't tell when your {months}-month waiting period ends. Please ask HR to add it to your profile — this unlocks automatically as soon as they do.
          </p>
        </div>
      </div>
    );
  }

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
    if (!onboardingComplete) {
      return ONBOARDING_TAB_KEYS
        .map((key) => permitted.find((item) => item.key === key))
        .filter(Boolean);
    }
    // "rulebook" only exists in TABS so the branch above can find it during
    // onboarding — once onboarding is complete its content lives inside the
    // "Mediclaim Info" tab instead, so it's never offered as its own
    // top-level tab again.
    return permitted.filter((item) => item.key !== "rulebook");
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

      {tab === "coverage" && <MediclaimInfoTab lookups={lookups} onNavigate={selectTab} />}
      {tab === "family" && <FamilyMembersTab lookups={lookups} onboarding={lookups.onboarding} />}
      {tab === "claims" && <MyClaimsTab lookups={lookups} />}
      {tab === "rulebook" && <RuleBookTab lookups={lookups} onboarding={lookups.onboarding} />}
      {tab === "team" && <TeamClaimsTab />}
    </div>
  );
}
