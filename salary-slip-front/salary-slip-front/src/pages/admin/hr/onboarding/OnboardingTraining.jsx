import { useMemo, useState } from "react";
import { CalendarDays, Plus } from "lucide-react";
import Button from "../../../../components/ui/Button";
import { SkeletonTable } from "../../../../components/ui/Skeleton";
import DataTable from "../../../../components/onboarding/DataTable";
import PageHeader, { PreviewBanner } from "../../../../components/onboarding/PageHeader";
import {
  BarList,
  FilterChips,
  ProgressBar,
  SectionCard,
  StatusPill,
} from "../../../../components/onboarding/primitives";
import { onboardingApi } from "../../../../utils/onboardingApi";
import { useOnboardingResource } from "../../../../hooks/useOnboardingResource";

export default function OnboardingTraining() {
  const { data, source, loading } = useOnboardingResource(
    (token, type) => onboardingApi.getTraining(token, type),
    [],
  );
  const [filter, setFilter] = useState("ALL");

  const courses = useMemo(() => data || [], [data]);
  const filtered = useMemo(
    () => (filter === "ALL" ? courses : courses.filter((c) => c.category === filter)),
    [courses, filter],
  );

  const columns = [
    {
      key: "title",
      label: "Course",
      render: (c) => <b className="font-semibold">{c.title}</b>,
    },
    {
      key: "category",
      label: "Category",
      render: (c) => (
        <StatusPill tone={c.category === "Compliance" || c.category === "Mandatory" ? "info" : "mut"}>
          {c.category}
        </StatusPill>
      ),
    },
    {
      key: "enrolled",
      label: "Enrolled",
      hideBelow: "md",
      render: (c) => (
        <span className="tabular-nums">
          {c.completed} / {c.enrolled}
        </span>
      ),
    },
    {
      key: "percent",
      label: "Completion",
      className: "w-36",
      render: (c) => <ProgressBar value={c.percent} />,
    },
    {
      key: "due",
      label: "Due",
      render: (c) => <span className="font-mono text-xs text-gray-400">{c.due}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Training"
        subtitle="76% average completion · 11 learners behind schedule"
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<CalendarDays size={15} />}>
              Training calendar
            </Button>
            <Button size="sm" icon={<Plus size={15} />}>
              Assign training
            </Button>
          </>
        }
      />

      {source === "preview" ? <PreviewBanner /> : null}

      {loading ? (
        <SkeletonTable rows={6} />
      ) : (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 xl:col-span-8">
            <SectionCard>
              <div className="flex flex-wrap items-center gap-2 rounded-t-2xl border-b border-gray-200 bg-gray-50 px-3.5 py-3 dark:border-gray-800 dark:bg-gray-800/50">
                <FilterChips
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: "ALL", label: "All courses" },
                    { value: "Mandatory", label: "Mandatory" },
                    { value: "Compliance", label: "Compliance" },
                    { value: "Department", label: "Department" },
                    { value: "Product", label: "Product" },
                  ]}
                />
              </div>
              <DataTable columns={columns} rows={filtered} rowKey={(c) => c.id} />
            </SectionCard>
          </div>

          <div className="col-span-12 flex flex-col gap-4 xl:col-span-4">
            <SectionCard title="Completion by category">
              <div className="p-4">
                <BarList
                  items={[
                    { label: "Orientation", value: 98, tone: "ok" },
                    { label: "Compliance", value: 78, tone: "brand" },
                    { label: "Safety", value: 84, tone: "ok" },
                    { label: "Department", value: 50, tone: "warn" },
                    { label: "Product", value: 25, tone: "bad" },
                  ]}
                />
                <p className="mt-3 text-[11.5px] text-gray-400 dark:text-gray-500">
                  Product induction is the outlier — only 3 of 12 enrolled have started.
                </p>
              </div>
            </SectionCard>

            <SectionCard title="Certificates issued">
              <div className="flex flex-col gap-3 p-4">
                {[
                  ["Workplace Safety", "38 issued"],
                  ["POSH", "41 issued"],
                  ["Information Security", "29 issued"],
                ].map(([title, count]) => (
                  <div key={title} className="flex items-center gap-3">
                    <div className="flex-1">
                      <b className="block text-[12.5px] font-semibold">{title}</b>
                      <small className="text-[11.5px] text-gray-400">{count}</small>
                    </div>
                    <Button variant="ghost" size="sm">
                      Download
                    </Button>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  );
}
