import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Briefcase, Download, Filter, Plus } from "lucide-react";
import Button from "../../../../components/ui/Button";
import { SkeletonTable } from "../../../../components/ui/Skeleton";
import Stepper from "../../../../components/onboarding/Stepper";
import SlideOver from "../../../../components/onboarding/SlideOver";
import { PreviewBanner } from "../../../../components/onboarding/PageHeader";
import {
  BarList,
  EmptyState,
  Eyebrow,
  KpiTile,
  Person,
  ProgressBar,
  SectionCard,
  StatusPill,
} from "../../../../components/onboarding/primitives";
import { onboardingApi } from "../../../../utils/onboardingApi";
import { useOnboardingResource } from "../../../../hooks/useOnboardingResource";

const STATUS = {
  PRE_BOARDING: ["Pre-boarding", "info"],
  IN_PROGRESS: ["In progress", "warn"],
  PROBATION: ["Probation", "mut"],
  COMPLETED: ["Completed", "ok"],
};

export default function OnboardingDashboard() {
  const { data, source, loading, error, reload } = useOnboardingResource(
    (token, type) => onboardingApi.getDashboard(token, type),
    [],
  );
  const [detail, setDetail] = useState(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2.5">
          {(data?.kpis || []).map((k) => (
            <div key={k.key} className="w-40 sm:w-44">
              <KpiTile
                label={k.label}
                value={k.value}
                unit={k.unit}
                tone={k.tone}
                trend={k.trend}
                onClick={() => setDetail(k)}
              />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon={<Filter size={15} />}>
            Filters
          </Button>
          <Button variant="secondary" size="sm" icon={<Download size={15} />}>
            Export
          </Button>
          <Button size="sm" icon={<Plus size={15} />}>
            New joiner
          </Button>
        </div>
      </div>

      {source === "preview" ? <PreviewBanner /> : null}

      {loading ? (
        <SkeletonTable rows={6} />
      ) : error || !data ? (
        <SectionCard>
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load the onboarding dashboard"
            description="The server didn't return any data. Please try again."
            action={
              <Button variant="secondary" size="sm" onClick={reload}>
                Retry
              </Button>
            }
          />
        </SectionCard>
      ) : (
        <>
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 xl:col-span-8">
              <SectionCard
                title="Joining timeline — next 7 days"
                action={
                  <Link
                    to="/admin/hr/onboarding/journeys"
                    className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    View all
                  </Link>
                }
              >
                <div className="p-4">
                  <Stepper steps={data.joiningWeek} />
                </div>
              </SectionCard>
            </div>

            <div className="col-span-12 xl:col-span-4">
              <SectionCard title="Onboarding funnel">
                <div className="p-4">
                  <BarList items={data.funnel} />
                  <p className="mt-3 text-[11.5px] text-gray-400 dark:text-gray-500">
                    Largest drop-off is documents to training. Clearing pending documents moves the
                    most people forward.
                  </p>
                </div>
              </SectionCard>
            </div>

            <div className="col-span-12">
              <SectionCard
                title={`Candidates onboarding — by job${data.candidatesByJob?.length ? ` (${data.candidatesByJob.length})` : ""}`}
                action={
                  <Link
                    to="/admin/hr/onboarding/journeys"
                    className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    View all
                  </Link>
                }
              >
                {!data.candidatesByJob || data.candidatesByJob.length === 0 ? (
                  <div className="p-4">
                    <p className="text-[12.5px] text-gray-400 dark:text-gray-500">No candidates are currently onboarding.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200 dark:divide-gray-800">
                    {data.candidatesByJob.map((group) => (
                      <div key={group.job}>
                        <div className="flex items-center gap-2 bg-gray-50 px-4 py-2 dark:bg-gray-800/40">
                          <Briefcase size={14} className="text-gray-400" />
                          <span className="text-[12.5px] font-semibold text-gray-700 dark:text-gray-200">{group.job}</span>
                          <span className="ml-auto text-[11px] font-semibold text-gray-400">
                            {group.candidates.length} candidate{group.candidates.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-[13px]">
                            <thead>
                              <tr>
                                {["Employee", "Department", "Joining date", "Progress", "Status", ""].map((h) => (
                                  <th
                                    key={h}
                                    className="border-b border-gray-200 px-3.5 py-2 text-left text-[10.5px] font-bold uppercase tracking-wider text-gray-400 dark:border-gray-800"
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {group.candidates.map((c) => (
                                <tr key={c.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800/60">
                                  <td className="px-3.5 py-2.5">
                                    <Person name={c.name} meta={c.code} />
                                  </td>
                                  <td className="px-3.5 py-2.5 text-gray-600 dark:text-gray-300">{c.dept}</td>
                                  <td className="px-3.5 py-2.5 text-gray-600 dark:text-gray-300">{c.joiningDate}</td>
                                  <td className="px-3.5 py-2.5 w-32">
                                    <ProgressBar value={c.progress} />
                                  </td>
                                  <td className="px-3.5 py-2.5">
                                    <StatusPill tone={STATUS[c.status][1]}>{STATUS[c.status][0]}</StatusPill>
                                  </td>
                                  <td className="px-3.5 py-2.5">
                                    <Button variant="secondary" size="sm" onClick={() => setDetail(c)}>
                                      Open
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>

          </div>
        </>
      )}

      <SlideOver
        open={Boolean(detail)}
        title={detail?.name || detail?.label || ""}
        onClose={() => setDetail(null)}
        footer={
          <Button variant="secondary" size="sm" onClick={() => setDetail(null)}>
            Close
          </Button>
        }
      >
        {detail?.name ? (
          <>
            <div className="mb-4 flex items-center gap-3">
              <Person name={detail.name} meta={detail.code} size={40} />
            </div>
            <div className="mb-4 grid grid-cols-2 gap-3">
              {[
                ["Joining", detail.joiningDate],
                ["Mode", detail.mode],
                ["Location", detail.location],
                ["Manager", detail.manager],
              ].map(([l, v]) => (
                <div key={l}>
                  <Eyebrow>{l}</Eyebrow>
                  <div className="mt-0.5 text-[13px] font-semibold">{v}</div>
                </div>
              ))}
            </div>
            <Eyebrow>Progress</Eyebrow>
            <div className="mt-2">
              <ProgressBar value={detail.progress} />
            </div>
          </>
        ) : (
          <>
            <p className="mt-0 text-[13px] text-gray-500 dark:text-gray-400">
              Breakdown for <b>{detail?.label}</b> across active journeys.
            </p>
            <BarList items={data?.byDepartment || []} />
          </>
        )}
      </SlideOver>
    </div>
  );
}
