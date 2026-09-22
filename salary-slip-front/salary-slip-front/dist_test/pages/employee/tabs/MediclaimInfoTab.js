import { jsx, jsxs } from "react/jsx-runtime";
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
const SECTION_META = {
  cards: { title: "My Mediclaim Cards", subtitle: "View, download or share your card's QR", size: "lg" },
  rulebook: { title: "Rule Book", subtitle: "Policy terms \u2014 English, Hindi & Gujarati", size: "xl" },
  hospitals: { title: "Network Hospitals", subtitle: "Location, contacts and cashless status", size: "xl" }
};
function ActionTile({ icon: Icon, accent, label, subtitle, onClick }) {
  return /* @__PURE__ */ jsxs(
    "button",
    {
      type: "button",
      onClick,
      className: "group flex flex-col items-start gap-4 rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-gray-700 dark:bg-gray-800",
      children: [
        /* @__PURE__ */ jsx("div", { className: `flex h-12 w-12 items-center justify-center rounded-2xl ${accent}`, children: /* @__PURE__ */ jsx(Icon, { size: 22 }) }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("p", { className: "text-sm font-bold text-gray-900 dark:text-white", children: label }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-400", children: subtitle })
        ] }),
        /* @__PURE__ */ jsxs("span", { className: "mt-auto flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400", children: [
          "Open ",
          /* @__PURE__ */ jsx(ArrowRight, { size: 12, className: "transition-transform group-hover:translate-x-1" })
        ] })
      ]
    }
  );
}
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
    if (!accessToken) return void 0;
    let cancelled = false;
    mediclaimApi.myCoverage(accessToken, tokenType).then((res) => {
      if (cancelled) return;
      setResult({ key: requestKey, coverage: res?.data ?? null, error: null });
    }).catch((err) => {
      if (cancelled) return;
      setResult({ key: requestKey, coverage: null, error: err?.message || "Failed to load your coverage." });
    });
    mediclaimApi.myCards(accessToken, tokenType).then((res) => {
      if (cancelled) return;
      const payload = res?.data;
      const cards = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
      setCardsCount(cards.length);
    }).catch(() => {
    });
    mediclaimApi.myClaims({ perPage: 100 }, accessToken, tokenType).then((res) => {
      if (cancelled) return;
      const payload = res?.data;
      const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
      setClaimsNeedingDocuments(rows.filter((row) => String(row?.status || "").toUpperCase() === "SUBMITTED"));
    }).catch(() => {
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, tokenType, requestKey]);
  const state = { loading: result.key !== requestKey, coverage: result.coverage, error: result.error };
  if (state.loading) {
    return /* @__PURE__ */ jsx("p", { className: "py-10 text-center text-sm text-gray-400", children: "Loading your Mediclaim info\u2026" });
  }
  if (state.error) {
    return /* @__PURE__ */ jsx("p", { className: "py-10 text-center text-sm text-red-500", children: state.error });
  }
  const coverage = state.coverage;
  const enrollment = coverage?.enrollment;
  if (!coverage || !enrollment) {
    return /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-2 rounded-2xl border border-gray-100 bg-white py-16 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800", children: [
      /* @__PURE__ */ jsx(ShieldCheck, { size: 32, className: "text-gray-300 dark:text-gray-600" }),
      /* @__PURE__ */ jsx("p", { className: "max-w-sm text-sm text-gray-500 dark:text-gray-400", children: "You don't have an active Mediclaim enrollment yet. Contact HR if you believe this is incorrect." })
    ] });
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
  const usedPct = floaterLimit > 0 ? Math.min(100, Math.round(floaterUsed / floaterLimit * 100)) : 0;
  const fyStart = floater.financialYearStart || floater.financial_year_start;
  const fyEnd = floater.financialYearEnd || floater.financial_year_end;
  const members = coverage.members || [];
  const hospitalsList = lookups?.hospitals && lookups.hospitals.length > 0 ? lookups.hospitals : coverage?.hospitals || [];
  const hospitalsCount = hospitalsList.length;
  const publishedRuleBookLanguages = new Set(
    (lookups?.ruleBooks || []).filter((rb) => String(rb.status || "").toLowerCase() === "published").map((rb) => rb.languageId ?? rb.language_id ?? rb.language?.id)
  ).size;
  const meta = activeSection ? SECTION_META[activeSection] : null;
  return /* @__PURE__ */ jsxs("div", { className: "space-y-5", children: [
    claimsNeedingDocuments.length > 0 && /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10", children: [
      /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-2 text-amber-800 dark:text-amber-300", children: [
        /* @__PURE__ */ jsx(AlertTriangle, { size: 16, className: "flex-shrink-0" }),
        claimsNeedingDocuments.length === 1 ? "1 claim has been submitted and is waiting on document uploads." : `${claimsNeedingDocuments.length} of your claims have been submitted and are waiting on document uploads.`
      ] }),
      /* @__PURE__ */ jsx(Button, { size: "sm", variant: "amber", onClick: () => onNavigate?.("claims"), children: "Go to My Claims" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsx("div", { className: "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400", children: /* @__PURE__ */ jsx(ShieldCheck, { size: 20 }) }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx("p", { className: "text-base font-bold text-gray-900 dark:text-white", children: policyName }),
            /* @__PURE__ */ jsx(Badge, { variant: isActive ? "green" : "gray", children: enrollment.status || "\u2014" })
          ] }),
          /* @__PURE__ */ jsxs("p", { className: "text-xs text-gray-400", children: [
            formatClaimDate(validFrom),
            " \u2013 ",
            formatClaimDate(validTo) || "Ongoing"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "mt-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "mb-1.5 flex flex-wrap items-center justify-between gap-1 text-xs", children: [
          /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1 font-semibold text-gray-600 dark:text-gray-300", children: [
            /* @__PURE__ */ jsx(IndianRupee, { size: 12 }),
            " Floater Usage"
          ] }),
          /* @__PURE__ */ jsxs("span", { className: "text-gray-500 dark:text-gray-400", children: [
            formatCurrencyINR(floaterUsed),
            " used of ",
            formatCurrencyINR(floaterLimit),
            " \xB7 ",
            /* @__PURE__ */ jsxs("span", { className: "font-semibold text-emerald-600 dark:text-emerald-400", children: [
              formatCurrencyINR(floaterRemaining),
              " remaining"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "h-2.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700", children: /* @__PURE__ */ jsx(
          "div",
          {
            className: `h-full rounded-full ${usedPct >= 90 ? "bg-red-500" : usedPct >= 70 ? "bg-amber-500" : "bg-brand-600"}`,
            style: { width: `${usedPct}%` }
          }
        ) }),
        fyStart && fyEnd && /* @__PURE__ */ jsxs("p", { className: "mt-1.5 text-[11px] text-gray-400", children: [
          "For the financial year ",
          formatClaimDate(fyStart),
          " \u2013 ",
          formatClaimDate(fyEnd),
          " \xB7 resets every April 1st"
        ] })
      ] }),
      members.length > 0 && /* @__PURE__ */ jsxs("div", { className: "mt-4", children: [
        /* @__PURE__ */ jsx("p", { className: "mb-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400", children: "Covered Members" }),
        /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: members.map((m) => /* @__PURE__ */ jsxs("span", { className: "rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-200", children: [
          memberName(m),
          " ",
          /* @__PURE__ */ jsxs("span", { className: "text-gray-400", children: [
            "\xB7 ",
            m.relationshipType || m.relationship_type
          ] })
        ] }, m.id)) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("p", { className: "mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500", children: "Everything Mediclaim" }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3", children: [
        /* @__PURE__ */ jsx(
          ActionTile,
          {
            icon: IdCard,
            accent: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
            label: "Cards",
            subtitle: cardsCount != null ? `${cardsCount} issued` : "View & download",
            onClick: () => setActiveSection("cards")
          }
        ),
        /* @__PURE__ */ jsx(
          ActionTile,
          {
            icon: BookOpen,
            accent: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
            label: "Rule Book",
            subtitle: publishedRuleBookLanguages > 0 ? `${publishedRuleBookLanguages} language${publishedRuleBookLanguages === 1 ? "" : "s"}` : "Policy terms",
            onClick: () => setActiveSection("rulebook")
          }
        ),
        /* @__PURE__ */ jsx(
          ActionTile,
          {
            icon: Building2,
            accent: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
            label: "Network Hospitals",
            subtitle: `${hospitalsCount} in network`,
            onClick: () => setActiveSection("hospitals")
          }
        ),
        /* @__PURE__ */ jsx(
          ActionTile,
          {
            icon: Users,
            accent: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
            label: "Family Members",
            subtitle: "Add or manage covered members",
            onClick: () => onNavigate?.("family")
          }
        ),
        /* @__PURE__ */ jsx(
          ActionTile,
          {
            icon: FilePlus2,
            accent: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
            label: "Submit a Claim",
            subtitle: "File a new reimbursement claim",
            onClick: () => onNavigate?.("claims")
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs(
      Drawer,
      {
        isOpen: Boolean(activeSection),
        onClose: () => setActiveSection(null),
        title: meta?.title,
        subtitle: meta?.subtitle,
        size: meta?.size || "lg",
        children: [
          activeSection === "cards" && /* @__PURE__ */ jsx(CardViewer, { onLoaded: (cards) => setCardsCount(cards.length) }),
          activeSection === "rulebook" && /* @__PURE__ */ jsx(RuleBookViewer, { ruleBooks: lookups?.ruleBooks || [], loading: lookups?.loading, error: lookups?.error }),
          activeSection === "hospitals" && /* @__PURE__ */ jsx(HospitalDirectory, { hospitals: hospitalsList, loading: lookups?.loading, error: lookups?.error })
        ]
      }
    )
  ] });
}
