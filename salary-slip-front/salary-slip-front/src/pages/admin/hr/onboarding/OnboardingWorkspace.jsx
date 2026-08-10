import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download, Plus } from "lucide-react";
import Button from "../../../../components/ui/Button";
import { KpiTile } from "../../../../components/onboarding/primitives";
import { PreviewBanner } from "../../../../components/onboarding/PageHeader";
import { onboardingApi } from "../../../../utils/onboardingApi";
import { useOnboardingResource } from "../../../../hooks/useOnboardingResource";
import OverviewTab from "./OverviewTab";
import EmployeesTab from "./EmployeesTab";
import DocumentsTab from "./DocumentsTab";
import TimelineTab from "./TimelineTab";
import EmployeeDrawer from "./EmployeeDrawer";
import { downloadCsv } from "./onboardingCsv";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "employees", label: "Employees" },
  { key: "documents", label: "Documents" },
  { key: "timeline", label: "Timeline" },
];

// Maps an Overview pipeline-stage click onto the Employees tab's status
// filter — the two use different vocab (funnel stage vs journey status)
// because they're computed differently server-side, but the mapping is
// stable: no docs yet -> pre-boarding, some verified -> in progress, all
// verified -> probation.
const STAGE_TO_STATUS = {
  "Offer accepted": "PRE_BOARDING",
  "Documents uploaded": "IN_PROGRESS",
  "Documents verified": "PROBATION",
};

function biggestDropOffPct(funnel) {
  if (!funnel || funnel.length < 2) return 0;
  let worst = 0;
  for (let i = 0; i < funnel.length - 1; i++) {
    const from = funnel[i].value;
    const to = funnel[i + 1].value;
    if (from <= 0) continue;
    const pct = ((from - to) / from) * 100;
    if (pct > worst) worst = pct;
  }
  return Math.round(worst);
}

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

  const flatCandidates = useMemo(
    () => (data?.candidatesByJob || []).flatMap((g) => g.candidates),
    [data],
  );

  const readyToJoin = flatCandidates.filter((c) => c.progress >= 100).length;

  const completedThisMonth = useMemo(() => {
    const now = new Date();
    return flatCandidates.filter((c) => {
      if (c.progress < 100) return false;
      const d = new Date(c.joiningDate);
      return !Number.isNaN(d.getTime()) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [flatCandidates]);

  const dropOffPct = biggestDropOffPct(data?.funnel);

  const exportEmployees = () => {
    downloadCsv(
      "onboarding-candidates.csv",
      [
        { label: "Name", value: (c) => c.name },
        { label: "Code", value: (c) => c.code },
        { label: "Role", value: (c) => c.role },
        { label: "Department", value: (c) => c.dept },
        { label: "Joining date", value: (c) => c.joiningDate },
        { label: "Progress %", value: (c) => c.progress },
        { label: "Status", value: (c) => c.status },
      ],
      flatCandidates,
    );
  };

  return (
    <div className="flex flex-col gap-4">


      {source === "preview" ? <PreviewBanner /> : null}

      {!loading && !error && data ? (
        <div className="flex flex-wrap gap-2.5">
          {[
            { key: "pending", label: "Pending onboarding", value: data.kpis?.find((k) => k.key === "pending_onboarding")?.value ?? 0, tone: "brand" },
            { key: "today", label: "Today's joining", value: (data.todayJoining || []).length, tone: "brand" },
            { key: "docs_pending", label: "Documents pending", value: data.kpis?.find((k) => k.key === "docs_pending")?.value ?? 0, tone: "warn" },
            { key: "docs_verified", label: "Documents verified", value: data.kpis?.find((k) => k.key === "docs_verified")?.value ?? 0, tone: "ok", trend: data.weekly?.[1] ? { dir: "up", label: `${data.weekly[1].value} this week` } : undefined },
            { key: "ready", label: "Ready to join", value: readyToJoin, tone: "ok" },
            { key: "completed_month", label: "Completed this month", value: completedThisMonth, tone: "ok" },
            { key: "dropoff", label: "Biggest drop-off", value: dropOffPct, unit: "%", tone: dropOffPct > 30 ? "bad" : "brand" },
          ].map((k) => (
            <div key={k.key} className="w-40 sm:w-44">
              <KpiTile label={k.label} value={k.value} unit={k.unit} tone={k.tone} trend={k.trend} />
            </div>
          ))}
        </div>
      ) : null}

      <div className="sticky top-0 z-30 -mx-4 md:-mx-6 px-4 md:px-6 bg-gray-50/95 dark:bg-[var(--sidebar-bg)]/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-4">
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
        <div className="flex flex-wrap gap-2 pb-2 sm:pb-0 sm:pt-0">
          <Button variant="secondary" size="sm" icon={<Download size={15} />} onClick={exportEmployees}>
            Export
          </Button>
          <Link to="/admin/hr/hiring?tab=candidates">
            <Button size="sm" icon={<Plus size={15} />}>New joiner</Button>
          </Link>
        </div>
      </div>

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

      <EmployeeDrawer employee={selectedEmployee} onClose={() => setSelectedEmployee(null)} />
    </div>
  );
}
