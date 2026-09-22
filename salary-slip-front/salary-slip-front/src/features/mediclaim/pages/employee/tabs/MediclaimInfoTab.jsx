import { useEffect, useState } from "react";
import { ShieldCheck, Users, IdCard, BookOpen, Building2, IndianRupee, ArrowRight, FilePlus2, AlertTriangle } from "lucide-react";
import { useAuth } from "../../../../../context/AuthContext";
import { mediclaimApi } from "../../../services/mediclaimApi";
import { formatCurrencyINR, formatClaimDate } from "../../../utils/formatters";
import Badge from "../../../../../components/ui/Badge";
import Button from "../../../../../components/ui/Button";
import Drawer from "../../../../../components/ui/Drawer";
import CardViewer from "../../../components/CardViewer";
import RuleBookViewer from "../../../components/RuleBookViewer";
import HospitalDirectory from "../../../components/HospitalDirectory";

function memberName(member) {
  return member?.fullName || member?.full_name || member?.name || "";
}

// Metadata for whichever section is currently open in the shared drawer
// below — keyed the same way `activeSection` state is, so the Drawer's
// title/subtitle/size never has to be duplicated at each button's call site.
const SECTION_META = {
  cards: { title: "My Mediclaim Cards", subtitle: "View, download or share your card's QR", size: "lg" },
  rulebook: { title: "Rule Book", subtitle: "Policy terms — English, Hindi & Gujarati", size: "xl" },
  hospitals: { title: "Network Hospitals", subtitle: "Location, contacts and cashless status", size: "xl" },
};

function ActionTile({ icon: Icon, accent, label, subtitle, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-start gap-4 rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-700 dark:bg-gray-800"
    >
      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${accent}`}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-sm font-bold text-gray-900 dark:text-white">{label}</p>
        <p className="text-xs text-gray-400">{subtitle}</p>
      </div>
      <span className="mt-auto flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400">
        Open <ArrowRight size={12} className="transition-transform group-hover:translate-x-1" />
      </span>
    </button>
  );
}

/**
 * "Mediclaim Info" — the employee's dashboard-style home for their policy.
 * A hero card (policy, floater usage, covered members) sits above a grid of
 * large, distinct action buttons — Cards / Rule Book / Network Hospitals
 * open their full content in a slide-in drawer on top of this page; Family
 * Members / Submit a Claim jump straight to those other workspace tabs. No
 * hidden pill-tab switcher and no giant single-page scroll — one clear set
 * of buttons, one thing open at a time, everything reachable from here.
 *
 * Cards/Rule Book/Hospitals content is `CardViewer`/`RuleBookViewer`/
 * `HospitalDirectory`, reused completely unmodified except `CardViewer`'s
 * optional `onLoaded` (used to keep the Cards tile's count accurate). Only
 * one `<Drawer>` is ever mounted — its content swaps on `activeSection`
 * rather than three separate drawer instances.
 *
 * Coverage/floater/member/hospital-count data comes from one `myCoverage()`
 * call this component owns (the old `MyCoverageTab.jsx` that used to own
 * this fetch was retired once its content became this page's hero). A
 * second, lightweight `myCards()` call runs alongside it purely so the
 * Cards tile can show a real count before the drawer is ever opened —
 * `coverage` doesn't include card data, so there's no way to get that
 * number for free the way the Rule Book/Hospitals counts come from data
 * already on hand (`lookups.ruleBooks`, `coverage.hospitals`). A third
 * `myClaims()` call finds any claim carrying a non-empty
 * `missing_document_types` (computed server-side, see
 * `MyClaimController::index()`) and surfaces it as a dismissal-free banner
 * at the top of this page — the point being that "approved, now upload
 * your documents" is visible the moment an employee opens Mediclaim at all,
 * not only once they happen to open "My Claims".
 *
 * The floater usage bar's "used"/"remaining" figures are always scoped to
 * the current financial year (`PolicyEligibilityService::floaterUsage()`),
 * shown as a date range under the bar — the ₹3,00,000 (or whatever the
 * policy sets) limit renews every April 1st, it is not a lifetime cap.
 *
 * Rule Book still exists as its own top-level workspace tab too, but ONLY
 * while onboarding is incomplete — see `EmployeeMediclaimWorkspace.jsx`'s
 * `ONBOARDING_TAB_KEYS`/`availableTabs`, which keeps it reachable (with its
 * "I have read this" acknowledgement action) before Family Members unlocks.
 * This drawer is the plain, read-only, steady-state home for the same
 * content afterwards.
 */
export default function MediclaimInfoTab({ lookups, onNavigate }) {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const requestKey = `${accessToken ?? ""}|${tokenType ?? ""}`;
  const [result, setResult] = useState({ key: null, coverage: null, error: null });
  const [cardsCount, setCardsCount] = useState(null);
  const [claimsNeedingDocuments, setClaimsNeedingDocuments] = useState([]);
  const [activeSection, setActiveSection] = useState(null);

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;

    mediclaimApi.myCoverage(accessToken, tokenType)
      .then((res) => {
        if (cancelled) return;
        setResult({ key: requestKey, coverage: res?.data ?? null, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({ key: requestKey, coverage: null, error: err?.message || "Failed to load your coverage." });
      });

    mediclaimApi.myCards(accessToken, tokenType)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const cards = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        setCardsCount(cards.length);
      })
      .catch(() => {});

    // Same computed `missing_document_types` field "My Claims" uses (see
    // MyClaimController::index()) — surfaced here too, on the employee's
    // actual Mediclaim landing page, so a claim approved but still waiting
    // on documents isn't only discoverable by opening "My Claims" first.
    mediclaimApi.myClaims({ perPage: 100 }, accessToken, tokenType)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        setClaimsNeedingDocuments(rows.filter((row) => String(row?.status || '').toUpperCase() === 'SUBMITTED'));
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [accessToken, tokenType, requestKey]);

  const state = { loading: result.key !== requestKey, coverage: result.coverage, error: result.error };

  if (state.loading) {
    return <p className="py-10 text-center text-sm text-gray-400">Loading your Mediclaim info…</p>;
  }

  if (state.error) {
    return <p className="py-10 text-center text-sm text-red-500">{state.error}</p>;
  }

  const coverage = state.coverage;
  const enrollment = coverage?.enrollment;

  if (!coverage || !enrollment) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-gray-100 bg-white py-16 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <ShieldCheck size={32} className="text-gray-300 dark:text-gray-600" />
        <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
          You don&apos;t have an active Mediclaim enrollment yet. Contact HR if you believe this is incorrect.
        </p>
      </div>
    );
  }

  const policyVersion = enrollment.policyVersion || enrollment.policy_version;
  const policy = policyVersion?.policy;
  const policyName = policy?.name || "Mediclaim Policy";
  const validFrom = policyVersion?.effectiveFrom || policyVersion?.effective_from || enrollment.enrolledAt || enrollment.enrolled_at;
  const validTo = policyVersion?.effectiveTo || policyVersion?.effective_to || enrollment.terminatedAt || enrollment.terminated_at;
  const isActive = String(enrollment.status || "").toLowerCase() === "active";

  const floater = coverage.floater || {};
  const floaterLimit = Number(floater.limit) || 0;
  const floaterUsed = Number(floater.used) || 0;
  const floaterRemaining = floater.remaining != null ? Number(floater.remaining) : floaterLimit - floaterUsed;
  const usedPct = floaterLimit > 0 ? Math.min(100, Math.round((floaterUsed / floaterLimit) * 100)) : 0;
  // The floater renews every financial year (see PolicyEligibilityService::
  // floaterUsage()) — "used"/"remaining" above are always scoped to the FY
  // this date range names, never the enrollment's whole lifetime.
  const fyStart = floater.financialYearStart || floater.financial_year_start;
  const fyEnd = floater.financialYearEnd || floater.financial_year_end;

  const members = coverage.members || [];
  const hospitalsList = (lookups?.hospitals && lookups.hospitals.length > 0)
    ? lookups.hospitals
    : (coverage?.hospitals || []);
  const hospitalsCount = hospitalsList.length;
  const publishedRuleBookLanguages = new Set(
    (lookups?.ruleBooks || [])
      .filter((rb) => String(rb.status || "").toLowerCase() === "published")
      .map((rb) => rb.languageId ?? rb.language_id ?? rb.language?.id),
  ).size;

  const meta = activeSection ? SECTION_META[activeSection] : null;

  return (
    <div className="space-y-5">
      {claimsNeedingDocuments.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
          <span className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <AlertTriangle size={16} className="flex-shrink-0" />
            {claimsNeedingDocuments.length === 1
              ? "1 claim has been submitted and is waiting on document uploads."
              : `${claimsNeedingDocuments.length} of your claims have been submitted and are waiting on document uploads.`}
          </span>
          <Button size="sm" variant="amber" onClick={() => onNavigate?.("claims")}>
            Go to My Claims
          </Button>
        </div>
      )}

      {/* Hero: policy + floater usage + covered members */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
            <ShieldCheck size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-base font-bold text-gray-900 dark:text-white">{policyName}</p>
              <Badge variant={isActive ? "green" : "gray"}>{enrollment.status || "—"}</Badge>
            </div>
            <p className="text-xs text-gray-400">{formatClaimDate(validFrom)} – {formatClaimDate(validTo) || "Ongoing"}</p>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1 text-xs">
            <span className="flex items-center gap-1 font-semibold text-gray-600 dark:text-gray-300">
              <IndianRupee size={12} /> Floater Usage
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              {formatCurrencyINR(floaterUsed)} used of {formatCurrencyINR(floaterLimit)}
              {" · "}<span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrencyINR(floaterRemaining)} remaining</span>
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
            <div
              className={`h-full rounded-full ${usedPct >= 90 ? "bg-red-500" : usedPct >= 70 ? "bg-amber-500" : "bg-brand-600"}`}
              style={{ width: `${usedPct}%` }}
            />
          </div>
          {fyStart && fyEnd && (
            <p className="mt-1.5 text-[11px] text-gray-400">
              For the financial year {formatClaimDate(fyStart)} – {formatClaimDate(fyEnd)} · resets every April 1st
            </p>
          )}
        </div>

        {members.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Covered Members</p>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <span key={m.id} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                  {memberName(m)} <span className="text-gray-400">· {m.relationshipType || m.relationship_type}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Big action buttons — everything an employee needs from here */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Everything Mediclaim</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ActionTile
            icon={IdCard}
            accent="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
            label="Cards"
            subtitle={cardsCount != null ? `${cardsCount} issued` : "View & download"}
            onClick={() => setActiveSection("cards")}
          />
          <ActionTile
            icon={BookOpen}
            accent="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
            label="Rule Book"
            subtitle={publishedRuleBookLanguages > 0 ? `${publishedRuleBookLanguages} language${publishedRuleBookLanguages === 1 ? "" : "s"}` : "Policy terms"}
            onClick={() => setActiveSection("rulebook")}
          />
          <ActionTile
            icon={Building2}
            accent="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
            label="Network Hospitals"
            subtitle={`${hospitalsCount} in network`}
            onClick={() => setActiveSection("hospitals")}
          />
          <ActionTile
            icon={Users}
            accent="bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400"
            label="Family Members"
            subtitle="Add or manage covered members"
            onClick={() => onNavigate?.("family")}
          />
          <ActionTile
            icon={FilePlus2}
            accent="bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
            label="Submit a Claim"
            subtitle="File a new reimbursement claim"
            onClick={() => onNavigate?.("claims")}
          />
        </div>
      </div>

      <Drawer
        isOpen={Boolean(activeSection)}
        onClose={() => setActiveSection(null)}
        title={meta?.title}
        subtitle={meta?.subtitle}
        size={meta?.size || "lg"}
      >
        {activeSection === "cards" && <CardViewer onLoaded={(cards) => setCardsCount(cards.length)} />}
        {activeSection === "rulebook" && (
          <RuleBookViewer ruleBooks={lookups?.ruleBooks || []} loading={lookups?.loading} error={lookups?.error} />
        )}
        {activeSection === "hospitals" && (
          <HospitalDirectory hospitals={hospitalsList} loading={lookups?.loading} error={lookups?.error} />
        )}
      </Drawer>
    </div>
  );
}
