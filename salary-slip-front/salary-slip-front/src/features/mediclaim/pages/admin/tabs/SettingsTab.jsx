import { useState } from "react";
import { BookOpen, Building2, ChevronRight, SlidersHorizontal, UserCog } from "lucide-react";
import { useMediclaimAuthorization, MEDICLAIM_PERMISSIONS } from "../../../hooks/useMediclaimAuthorization";
import RuleBooksTab from "./RuleBooksTab";
import HospitalsTab from "./HospitalsTab";
import DocumentSettingsTab from "./DocumentSettingsTab";
import ReviewersTab from "./ReviewersTab";

// Everything HR configures outside a claim's own workflow, in one tab. A
// settings-page layout (left nav, right content pane) rather than a grid of
// big buttons or a popup per section — one section is open at a time, in
// place, with no drawer/modal layering to manage.
const SECTIONS = [
  { key: "rulebooks", label: "Rule Books", subtitle: "Languages & policy rules", icon: BookOpen, Tab: RuleBooksTab },
  { key: "hospitals", label: "Hospitals", subtitle: "Network directory & contacts", icon: Building2, Tab: HospitalsTab },
  {
    key: "documents",
    label: "Document Requirements",
    subtitle: "Required documents & file size",
    icon: SlidersHorizontal,
    Tab: DocumentSettingsTab,
    permission: MEDICLAIM_PERMISSIONS.DOCUMENT_REQUIREMENT_READ,
  },
  {
    key: "reviewers",
    label: "Reviewers",
    subtitle: "Who decides claims at each stage",
    icon: UserCog,
    Tab: ReviewersTab,
    permission: MEDICLAIM_PERMISSIONS.REVIEWER_ASSIGNMENT_READ,
  },
];

/**
 * The admin workspace's "Settings" tab — Rule Books, Hospitals, Document
 * Requirements and Reviewers combined into one place, each reached from a
 * left-hand nav list rather than a separate top-level tab (they used to be
 * that) or a popup/drawer per section. `RuleBooksTab`/`HospitalsTab`/
 * `DocumentSettingsTab`/`ReviewersTab` are reused completely unmodified —
 * only where they're reached from changed.
 *
 * `ReviewersTab` existed before this tab did but was never wired into the
 * workspace at all — there was no route to it anywhere, so HR had no way to
 * assign a Coordinator/Committee/HR-Eligibility/Director reviewer for any
 * company. Without at least one active assignment per stage, a claim that
 * clears Manager Review has no one to route to, which is exactly what read
 * as "the approve/accept feature isn't there" — the review panels
 * (`PendingReviewsTab.jsx`) were fully built, just permanently unreachable
 * downstream of an empty `mediclaim_reviewer_assignments` table.
 */
export default function SettingsTab() {
  const { can } = useMediclaimAuthorization();
  const availableSections = SECTIONS.filter((s) => !s.permission || can(s.permission));
  const [activeKey, setActiveKey] = useState(null);
  const active = availableSections.find((s) => s.key === activeKey) || availableSections[0];
  const ActiveTab = active?.Tab;

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <nav className="flex flex-shrink-0 gap-1.5 overflow-x-auto pb-1 lg:w-60 lg:flex-col lg:overflow-visible lg:pb-0">
        {availableSections.map((s) => {
          const Icon = s.icon;
          const isActive = active?.key === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setActiveKey(s.key)}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                isActive
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              <Icon size={16} className="flex-shrink-0" />
              <span className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{s.label}</p>
                <p className={`truncate text-[11px] ${isActive ? "text-brand-500/80 dark:text-brand-400/70" : "text-gray-400"}`}>{s.subtitle}</p>
              </span>
              <ChevronRight size={14} className={`hidden flex-shrink-0 lg:block ${isActive ? "opacity-100" : "opacity-0"}`} />
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 flex-1">
        {ActiveTab && <ActiveTab />}
      </div>
    </div>
  );
}
