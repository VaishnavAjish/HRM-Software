import { useState } from "react";
import { LayoutTemplate, Plus } from "lucide-react";
import Button from "../../../../components/ui/Button";
import { SkeletonTable } from "../../../../components/ui/Skeleton";
import PageHeader, { PreviewBanner } from "../../../../components/onboarding/PageHeader";
import {
  Avatar,
  BarList,
  FilterChips,
  SectionCard,
  StatusPill,
} from "../../../../components/onboarding/primitives";
import { onboardingApi } from "../../../../utils/onboardingApi";
import { useOnboardingResource } from "../../../../hooks/useOnboardingResource";

const COLUMN_TONE = {
  PENDING: "mut",
  IN_PROGRESS: "warn",
  AWAITING_APPROVAL: "info",
  DONE: "ok",
};

const PAST_SLA = [
  ["Raise VPN request", "IT · 14 h over"],
  ["Verify degree certificate", "HR · 6 h over"],
  ["Order safety boots", "Admin · 2 h over"],
];

export default function OnboardingChecklists() {
  const { data, source, loading } = useOnboardingResource(
    (token, type) => onboardingApi.getChecklists(token, type),
    [],
  );
  const [owner, setOwner] = useState("ALL");

  const columns = data || [];

  const visible = (tasks) => (owner === "ALL" ? tasks : tasks.filter((t) => t.owner === owner));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Checklists"
        subtitle="81% complete across 5 owner roles · 3 tasks past SLA"
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<LayoutTemplate size={15} />}>
              Templates
            </Button>
            <Button size="sm" icon={<Plus size={15} />}>
              Add task
            </Button>
          </>
        }
      />

      {source === "preview" ? <PreviewBanner /> : null}

      {loading ? (
        <SkeletonTable rows={6} />
      ) : (
        <>
          <SectionCard>
            <div className="flex flex-wrap items-center gap-2 rounded-t-2xl border-b border-gray-200 bg-gray-50 px-3.5 py-3 dark:border-gray-800 dark:bg-gray-800/50">
              <FilterChips
                value={owner}
                onChange={setOwner}
                options={[
                  { value: "ALL", label: "All owners" },
                  { value: "HR", label: "HR" },
                  { value: "IT", label: "IT" },
                  { value: "Admin", label: "Admin" },
                  { value: "Finance", label: "Finance" },
                ]}
              />
            </div>
            <div className="p-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {columns.map((col) => {
                  const tasks = visible(col.tasks);
                  return (
                    <div
                      key={col.key}
                      className="flex min-h-[130px] flex-col gap-2 rounded-[10px] border border-gray-200 bg-gray-50 p-2.5 dark:border-gray-800 dark:bg-gray-800/40"
                    >
                      <div className="flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {col.title}
                        <b className="ml-auto rounded-full border border-gray-200 bg-white px-1.5 text-[11px] tabular-nums dark:border-gray-700 dark:bg-gray-900">
                          {tasks.length}
                        </b>
                      </div>
                      {tasks.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className="w-full rounded-lg border border-gray-200 bg-white p-2.5 text-left shadow-sm transition hover:-translate-y-px hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
                        >
                          <b className="mb-1.5 block text-[12.5px] font-semibold">{t.title}</b>
                          <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-400">
                            <Avatar name={t.person} size={18} />
                            <span className="truncate">{t.person}</span>
                            <span className="ml-auto">
                              <StatusPill tone={COLUMN_TONE[col.key]}>{t.owner}</StatusPill>
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </SectionCard>

          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 lg:col-span-6">
              <SectionCard title="Completion by owner">
                <div className="p-4">
                  <BarList
                    items={[
                      { label: "HR", value: 92, tone: "ok" },
                      { label: "Manager", value: 84, tone: "ok" },
                      { label: "IT", value: 61, tone: "warn" },
                      { label: "Admin", value: 78, tone: "brand" },
                      { label: "Finance", value: 70, tone: "brand" },
                    ]}
                  />
                </div>
              </SectionCard>
            </div>

            <div className="col-span-12 lg:col-span-6">
              <SectionCard title="Past SLA">
                <div className="flex flex-col gap-3 p-4">
                  {PAST_SLA.map(([title, meta]) => (
                    <div key={title} className="flex items-center gap-3">
                      <span className="h-[30px] w-[3px] shrink-0 rounded-sm bg-rose-600" />
                      <div className="flex-1">
                        <b className="block text-[12.5px] font-semibold">{title}</b>
                        <small className="text-[11.5px] text-gray-400">{meta}</small>
                      </div>
                      <Button variant="secondary" size="sm">
                        Escalate
                      </Button>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
