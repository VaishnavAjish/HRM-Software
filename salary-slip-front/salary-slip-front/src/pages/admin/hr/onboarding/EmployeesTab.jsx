import { useEffect, useMemo, useState } from "react";
import { Download, Search, Users } from "lucide-react";
import Button from "../../../../components/ui/Button";
import { SkeletonTable } from "../../../../components/ui/Skeleton";
import DataTable from "../../../../components/onboarding/DataTable";
import {
  EmptyState,
  FilterChips,
  Person,
  ProgressBar,
  SectionCard,
  StatusPill,
} from "../../../../components/onboarding/primitives";
import { onboardingApi } from "../../../../utils/onboardingApi";
import { useOnboardingResource } from "../../../../hooks/useOnboardingResource";
import { downloadCsv } from "./onboardingCsv";

const STATUS = {
  PRE_BOARDING: ["Pre-boarding", "info"],
  IN_PROGRESS: ["In progress", "warn"],
  PROBATION: ["Probation", "mut"],
  COMPLETED: ["Completed", "ok"],
};

function docStatusLabel(progress) {
  if (progress >= 100) return "All verified";
  if (progress <= 0) return "None uploaded";
  return `${progress}% verified`;
}

export default function EmployeesTab({ initialFilter, onOpenEmployee }) {
  const { data, loading, error, reload } = useOnboardingResource(
    (token, type) => onboardingApi.getJourneys(token, type),
    [],
  );
  const [filter, setFilter] = useState(initialFilter || "ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (initialFilter) setFilter(initialFilter);
  }, [initialFilter]);

  const journeys = useMemo(() => data || [], [data]);

  const filtered = useMemo(() => {
    let rows = journeys;
    if (filter === "SLA") rows = rows.filter((j) => j.slaBreached);
    else if (filter !== "ALL") rows = rows.filter((j) => j.status === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((j) =>
        [j.name, j.role, j.dept].some((v) => (v || "").toLowerCase().includes(q)),
      );
    }
    return rows;
  }, [journeys, filter, search]);

  const count = (status) =>
    status === "ALL"
      ? journeys.length
      : status === "SLA"
        ? journeys.filter((j) => j.slaBreached).length
        : journeys.filter((j) => j.status === status).length;

  const exportCsv = () => {
    downloadCsv(
      "onboarding-employees.csv",
      [
        { label: "Name", value: (j) => j.name },
        { label: "Code", value: (j) => j.code },
        { label: "Role", value: (j) => j.role },
        { label: "Department", value: (j) => j.dept },
        { label: "Joining date", value: (j) => j.joiningDate },
        { label: "Progress %", value: (j) => j.progress },
        { label: "Status", value: (j) => STATUS[j.status]?.[0] || j.status },
        { label: "Document status", value: (j) => docStatusLabel(j.progress) },
        { label: "SLA breached", value: (j) => (j.slaBreached ? "Yes" : "No") },
      ],
      filtered,
    );
  };

  const columns = [
    { key: "name", label: "Employee", render: (j) => <Person name={j.name} meta={j.code} /> },
    {
      key: "role",
      label: "Role / Dept",
      hideBelow: "sm",
      render: (j) => (
        <>
          {j.role}
          <br />
          <small className="text-gray-400">{j.dept}</small>
        </>
      ),
    },
    { key: "joiningDate", label: "Joining", hideBelow: "md" },
    { key: "docStatus", label: "Document status", hideBelow: "md", render: (j) => docStatusLabel(j.progress) },
    { key: "progress", label: "Progress", className: "w-32", render: (j) => <ProgressBar value={j.progress} /> },
    {
      key: "status",
      label: "Status",
      render: (j) => (
        <div className="flex flex-wrap gap-1.5">
          <StatusPill tone={STATUS[j.status]?.[1] || "mut"}>{STATUS[j.status]?.[0] || j.status}</StatusPill>
          {j.slaBreached ? <StatusPill tone="bad">SLA</StatusPill> : null}
        </div>
      ),
    },
    {
      key: "actions",
      label: "",
      render: (j) => (
        <Button variant="secondary" size="sm" onClick={() => onOpenEmployee?.(j)}>
          Open
        </Button>
      ),
    },
  ];

  if (loading) return <SkeletonTable rows={8} />;

  return (
    <SectionCard>
      <div className="flex flex-wrap items-center gap-2 rounded-t-2xl border-b border-gray-200 bg-gray-50 px-3.5 py-3 dark:border-gray-800 dark:bg-gray-800/50">
        <FilterChips
          value={filter}
          onChange={setFilter}
          options={[
            { value: "ALL", label: "All", count: count("ALL") },
            { value: "PRE_BOARDING", label: "Pre-boarding", count: count("PRE_BOARDING") },
            { value: "IN_PROGRESS", label: "In progress", count: count("IN_PROGRESS") },
            { value: "PROBATION", label: "Probation", count: count("PROBATION") },
            { value: "SLA", label: "SLA breach", count: count("SLA") },
          ]}
        />
        <div className="relative ml-auto w-full max-w-[220px] sm:w-56">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employees…"
            className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-2.5 text-[12.5px] focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
        <Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={exportCsv}>
          Export
        </Button>
      </div>
      {error ? (
        <div className="p-4">
          <EmptyState
            icon={Users}
            title="Couldn't load employees"
            description="The server didn't return any data."
            action={<Button variant="secondary" size="sm" onClick={reload}>Retry</Button>}
          />
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(j) => j.id}
          empty={
            <EmptyState
              icon={Users}
              title="No employees match this filter"
              description="Try a different status, or clear the filter to see everyone onboarding."
              action={
                <Button variant="secondary" size="sm" onClick={() => { setFilter("ALL"); setSearch(""); }}>
                  Clear filters
                </Button>
              }
            />
          }
        />
      )}
    </SectionCard>
  );
}
