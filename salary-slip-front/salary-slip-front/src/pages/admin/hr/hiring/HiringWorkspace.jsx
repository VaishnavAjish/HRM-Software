import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { useCompany } from "../../../../context/CompanyContext";
import { salaryApi } from "../../../../utils/api";
import RequisitionsTab from "./RequisitionsTab";
import CandidatePipeline from "../CandidatePipeline";
import AssessmentTab from "./AssessmentTab";
import InterviewManagement from "../InterviewManagement";
import OfferManagement from "../OfferManagement";

const TABS = [
  { key: "requisitions", label: "Requisitions" },
  { key: "candidates", label: "Candidates" },
  { key: "assessment", label: "Assessment" },
  { key: "interview", label: "Interview" },
  { key: "offer", label: "Offer" },
];

/**
 * The Hiring workspace shell: title, sticky tab bar, then whichever tab is
 * active. The pipeline runs left to right: Requisitions/Candidates (sourcing)
 * -> Assessment (quiz, optional) -> Interview (scheduling/feedback/decision)
 * -> Offer (release/response). Each tab owns the candidate stages listed in
 * stageMeta.js's TAB_STAGE_KEYS — a candidate only shows up, and can only be
 * acted on, in the one tab that currently owns their stage. Onboarding lives
 * on its own full HR sidebar page now, not as a tab here.
 */
export default function HiringWorkspace() {
  const { user } = useAuth();
  const { companyScope, scopeKey } = useCompany();
  const [searchParams] = useSearchParams();
  const initialTab = TABS.some((t) => t.key === searchParams.get("tab"))
    ? searchParams.get("tab")
    : "requisitions";
  const [tab, setTab] = useState(initialTab);

  // Loaded once, shared by every tab's filter bar — avoids each tab
  // re-fetching the same department/people lookups independently.
  const [departments, setDepartments] = useState([]);
  const [people, setPeople] = useState([]);

  useEffect(() => {
    if (!user?.accessToken) return;
    salaryApi.getDepartments(user.accessToken, user.tokenType, companyScope?.companyId)
      .then((res) => res.status && setDepartments(res.data?.data || res.data || []))
      .catch(() => {});
    salaryApi.getAllEmployees(user.accessToken, user.tokenType, { status: "Active", per_page: 200 }, companyScope?.companyId)
      .then((res) => {
        const rows = res?.data?.data || res?.data || [];
        setPeople(rows.map((r) => ({ id: r.id, name: r.name })));
      })
      .catch(() => {});
  }, [user, scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-30 -mx-4 md:-mx-6 px-4 md:px-6 bg-gray-50/95 dark:bg-[var(--sidebar-bg)]/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? "border-brand-600 text-brand-600 dark:text-brand-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "requisitions" && <RequisitionsTab departments={departments} people={people} />}
      {tab === "candidates" && <CandidatePipeline departments={departments} people={people} />}
      {tab === "assessment" && <AssessmentTab />}
      {tab === "interview" && <InterviewManagement />}
      {tab === "offer" && <OfferManagement />}
    </div>
  );
}
