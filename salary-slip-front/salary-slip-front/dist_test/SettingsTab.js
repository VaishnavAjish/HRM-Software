import { jsx, jsxs } from "react/jsx-runtime";
import { useState } from "react";
import CardDesignSettingsTab from "./CardDesignSettingsTab";
import { BookOpen, Building2, ChevronRight, IdCard, SlidersHorizontal, UserCog } from "lucide-react";
import { useMediclaimAuthorization, MEDICLAIM_PERMISSIONS } from "../../../hooks/useMediclaimAuthorization";
import RuleBooksTab from "./RuleBooksTab";
import HospitalsTab from "./HospitalsTab";
import DocumentSettingsTab from "./DocumentSettingsTab";
import ReviewersTab from "./ReviewersTab";
const SECTIONS = [
  { key: "card-design", label: "ID Card Settings", subtitle: "Support email, phone & card layout", icon: IdCard, Tab: CardDesignSettingsTab },
  { key: "rulebooks", label: "Rule Books", subtitle: "Languages & policy rules", icon: BookOpen, Tab: RuleBooksTab },
  { key: "hospitals", label: "Hospitals", subtitle: "Network directory & contacts", icon: Building2, Tab: HospitalsTab },
  {
    key: "documents",
    label: "Document Requirements",
    subtitle: "Required documents & file size",
    icon: SlidersHorizontal,
    Tab: DocumentSettingsTab,
    permission: MEDICLAIM_PERMISSIONS.DOCUMENT_REQUIREMENT_READ
  },
  {
    key: "reviewers",
    label: "Reviewers",
    subtitle: "Who decides claims at each stage",
    icon: UserCog,
    Tab: ReviewersTab,
    permission: MEDICLAIM_PERMISSIONS.REVIEWER_ASSIGNMENT_READ
  }
];
export default function SettingsTab() {
  const { can } = useMediclaimAuthorization();
  const availableSections = SECTIONS.filter((s) => !s.permission || can(s.permission));
  const [activeKey, setActiveKey] = useState(null);
  const active = availableSections.find((s) => s.key === activeKey) || availableSections[0];
  const ActiveTab = active?.Tab;
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-5 lg:flex-row", children: [
    /* @__PURE__ */ jsx("nav", { className: "flex flex-shrink-0 gap-1.5 overflow-x-auto pb-1 lg:w-60 lg:flex-col lg:overflow-visible lg:pb-0", children: availableSections.map((s) => {
      const Icon = s.icon;
      const isActive = active?.key === s.key;
      return /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          onClick: () => setActiveKey(s.key),
          "aria-current": isActive ? "page" : void 0,
          className: `flex flex-shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${isActive ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"}`,
          children: [
            /* @__PURE__ */ jsx(Icon, { size: 16, className: "flex-shrink-0" }),
            /* @__PURE__ */ jsxs("span", { className: "min-w-0 flex-1", children: [
              /* @__PURE__ */ jsx("p", { className: "truncate text-sm font-semibold", children: s.label }),
              /* @__PURE__ */ jsx("p", { className: `truncate text-[11px] ${isActive ? "text-brand-500/80 dark:text-brand-400/70" : "text-gray-400"}`, children: s.subtitle })
            ] }),
            /* @__PURE__ */ jsx(ChevronRight, { size: 14, className: `hidden flex-shrink-0 lg:block ${isActive ? "opacity-100" : "opacity-0"}` })
          ]
        },
        s.key
      );
    }) }),
    /* @__PURE__ */ jsx("div", { className: "min-w-0 flex-1", children: ActiveTab && /* @__PURE__ */ jsx(ActiveTab, {}) })
  ] });
}
