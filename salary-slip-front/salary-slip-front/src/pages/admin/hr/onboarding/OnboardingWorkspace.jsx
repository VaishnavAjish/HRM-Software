import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PreviewBanner } from "../../../../components/onboarding/PageHeader";
import { onboardingApi } from "../../../../utils/onboardingApi";
import { useOnboardingResource } from "../../../../hooks/useOnboardingResource";
import OverviewTab from "./OverviewTab";
import EmployeesTab from "./EmployeesTab";
import DocumentsTab from "./DocumentsTab";
import TimelineTab from "./TimelineTab";
import EmployeeDrawer from "./EmployeeDrawer";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "employees", label: "Onboarding Candidate" },
  { key: "documents", label: "Documents" },
  { key: "timeline", label: "Onboarding Appointment" },
];

const STAGE_TO_STATUS = {
  "Offer accepted": "PRE_BOARDING",
  "Documents uploaded": "IN_PROGRESS",
  "Documents verified": "PROBATION",
};

export default function OnboardingWorkspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = TABS.some((t) => t.key === searchParams.get("tab")) ? searchParams.get("tab") : "overview";
  const [tab, setTab] = useState(initialTab);
  const [employeesFilter, setEmployeesFilter] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const { data, source, loading, error, reload } = useOnboardingResource(
    (token, type) => onboardingApi.getDashboard(token, type),
    [],
  );

  const goToTab = (key) => {
    setTab(key);
    setSearchParams(key === "overview" ? {} : { tab: key });
  };

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      {source === "preview" ? <PreviewBanner /> : null}

      <div className="shrink-0 sticky top-0 z-30 -mx-4 md:-mx-6 px-4 md:px-6 bg-gray-50 dark:bg-gray-900">
        <div className="border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-4">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => goToTab(t.key)}
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
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {tab === "overview" && (
          <OverviewTab
            data={data}
            loading={loading}
            error={error}
            reload={reload}
            onOpenEmployee={setSelectedEmployee}
            onFilterStage={(stageLabel) => {
              setEmployeesFilter(STAGE_TO_STATUS[stageLabel] || "ALL");
              goToTab("employees");
            }}
          />
        )}
        {tab === "employees" && (
          <EmployeesTab initialFilter={employeesFilter} onOpenEmployee={setSelectedEmployee} />
        )}
        {tab === "documents" && <DocumentsTab />}
        {tab === "timeline" && <TimelineTab activity={data?.activity} />}
      </div>

      <EmployeeDrawer employee={selectedEmployee} onClose={() => setSelectedEmployee(null)} />
    </div>
  );
}