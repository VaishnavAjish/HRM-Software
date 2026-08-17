import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { useCompany } from "../../../../context/CompanyContext";
import { salaryApi } from "../../../../utils/api";
import RequisitionsTab from "./RequisitionsTab";
import RequisitionFormModal from "./RequisitionFormModal";
import CandidatePipeline from "../CandidatePipeline";
import AssessmentTab from "./AssessmentTab";
import InterviewManagement from "../InterviewManagement";
import OfferManagement from "../OfferManagement";
import { useAuthorization } from "../../../../hooks/useAuthorization";
import ApprovalReviewTab from "./ApprovalReviewTab";
import JobPortalTab from "./JobPortalTab";
import RecruitmentDashboardTab from "./RecruitmentDashboardTab";
import TalentPoolTab from "./TalentPoolTab";
import HRManagerTab from "./HRManagerTab";

const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "requisitions", label: "Requisitions" },
  { key: "candidates", label: "Candidates" },
  { key: "talent-pool", label: "Talent Pool", permissions: ["ui.hr.hiring.talent_pools", "ui.hr.hiring.talent_pool"] },
  { key: "assessment", label: "Assessment" },
  { key: "interview", label: "Interview" },
  { key: "offer", label: "Offer" },
  { key: "hr-manager", label: "HR Manager", permissions: ["ui.hr.hiring.hr_manager_review", "ui.hr.hiring.hiring_manager_review"] },
  { key: "director", label: "Director", permissions: ["ui.hr.hiring.director_review"] },
  { key: "job-portal", label: "Job Portal", permissions: ["ui.hr.hiring.job_portal", "ui.hr.hiring.requisition_publish"] },
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
  const { can } = useAuthorization();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editModalTargetId, setEditModalTargetId] = useState(null);
  const [modalTitleOverride, setModalTitleOverride] = useState(null);
  const [modalExtraFooter, setModalExtraFooter] = useState(null);

  const openRequisitionForm = (id = null, title = null, footer = null) => {
    if (id === false) {
      setEditModalTargetId(null);
    } else {
      setEditModalTargetId(id || "new");
    }
    setModalTitleOverride(title);
    setModalExtraFooter(footer);
  };

  const availableTabs = useMemo(() => {
    return TABS.filter((item) => {
      if (!item.permissions) return true;
      return item.permissions.some((p) => can(p));
    });
  }, [can]);

  let rawTab = searchParams.get("tab");
  if (rawTab === "hiring-manager") {
    rawTab = "hr-manager";
  }

  const tab = availableTabs.some((item) => item.key === rawTab) ? rawTab : "dashboard";

  useEffect(() => {
    const currentTab = searchParams.get("tab");
    if (currentTab === "hiring-manager" || (currentTab && currentTab !== tab)) {
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
          {availableTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => selectTab(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
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

      {tab === "dashboard" && <RecruitmentDashboardTab onNavigate={selectTab} />}
      {tab === "requisitions" && <RequisitionsTab departments={departments} people={people} openRequisitionForm={openRequisitionForm} />}
      {tab === "candidates" && <CandidatePipeline departments={departments} people={people} />}
      {tab === "talent-pool" && <TalentPoolTab />}
      {tab === "assessment" && <AssessmentTab />}
      {tab === "interview" && <InterviewManagement />}
      {tab === "offer" && <OfferManagement />}
      {tab === "hr-manager" && <HRManagerTab departments={departments} people={people} openRequisitionForm={openRequisitionForm} isHrManagerView={true} />}
      {tab === "director" && <ApprovalReviewTab kind="director" departments={departments} people={people} openRequisitionForm={openRequisitionForm} />}
      {tab === "job-portal" && <JobPortalTab departments={departments} openRequisitionForm={openRequisitionForm} />}

      <RequisitionFormModal
        isOpen={Boolean(editModalTargetId)}
        targetId={editModalTargetId === "new" ? null : editModalTargetId}
        titleOverride={modalTitleOverride}
        extraFooter={modalExtraFooter}
        onClose={() => {
          setEditModalTargetId(null);
          setModalTitleOverride(null);
          setModalExtraFooter(null);
        }}
        onSuccess={() => { /* Tabs should poll or reload on focus, or we can add a global event */ }}
        initialDepartments={departments}
      />
    </div>
  );
}
