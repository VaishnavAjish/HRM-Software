import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { useCompany } from "../../../../context/CompanyContext";
import { salaryApi } from "../../../../utils/api";
import HiringMetricsRow from "./HiringMetricsRow";
import RequisitionsTab from "./RequisitionsTab";
import CandidatePipeline from "../CandidatePipeline";
import InterviewHub from "../InterviewHub";
import OfferManagement from "../OfferManagement";
import EmployeeOnboarding from "../EmployeeOnboarding";

const TABS = [
  { key: "requisitions", label: "Requisitions" },
  { key: "candidates", label: "Candidates" },
  { key: "interviews", label: "Interviews" },
  { key: "offers", label: "Offers" },
  { key: "onboarding", label: "Onboarding" },
];

/**
 * The Hiring workspace shell: title, live metrics row, sticky tab bar, then
 * whichever tab is active. Requisitions and Candidates get the full
 * enterprise redesign (shared filter bar, drawers); Offers/Onboarding keep
 * working exactly as before inside the same chrome until a follow-up phase
 * gives them the same treatment. Interviews uses the quiz-based InterviewHub
 * (quizzes, candidate assignment, proctoring results) rather than the plain
 * scheduling-only InterviewManagement, since that's the process HR actually
 * runs interviews through.
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
      <HiringMetricsRow />

      <div className="sticky top-0 z-30 -mx-4 md:-mx-6 px-4 md:px-6 bg-gray-50/95 dark:bg-[var(--sidebar-bg)]/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-1 overflow-x-auto">
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
      {tab === "interviews" && <InterviewHub />}
      {tab === "offers" && <OfferManagement />}
      {tab === "onboarding" && <EmployeeOnboarding />}
    </div>
  );
}
