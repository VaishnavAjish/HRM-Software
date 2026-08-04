import { useState } from "react";
import { Link } from "react-router-dom";
import { Download, Filter, Plus } from "lucide-react";
import Button from "../../../../components/ui/Button";
import { SkeletonTable } from "../../../../components/ui/Skeleton";
import Stepper from "../../../../components/onboarding/Stepper";
import Timeline from "../../../../components/onboarding/Timeline";
import SlideOver from "../../../../components/onboarding/SlideOver";
import PageHeader, { PreviewBanner } from "../../../../components/onboarding/PageHeader";
import {
  BarList,
  Eyebrow,
  KpiTile,
  Person,
  ProgressBar,
  SectionCard,
  Sparkline,
  StatusPill,
} from "../../../../components/onboarding/primitives";
import { onboardingApi } from "../../../../utils/onboardingApi";
import { useOnboardingResource } from "../../../../hooks/useOnboardingResource";
import { JOURNEYS } from "../../../../utils/onboardingMocks";

const STATUS = {
  PRE_BOARDING: ["Pre-boarding", "info"],
  IN_PROGRESS: ["In progress", "warn"],
  PROBATION: ["Probation", "mut"],
  COMPLETED: ["Completed", "ok"],
};

export default function OnboardingDashboard() {
  const { data, source, loading } = useOnboardingResource(
    (token, type) => onboardingApi.getDashboard(token, type),
    [],
  );
  const [detail, setDetail] = useState(null);

  const today = JOURNEYS.filter((j) => j.joiningDate === "04 Aug" || j.joiningDate === "05 Aug");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Onboarding overview"
        subtitle="42 active journeys across 6 departments · week of 04 August 2026"
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<Filter size={15} />}>
              Filters
            </Button>
            <Button variant="secondary" size="sm" icon={<Download size={15} />}>
              Export
            </Button>
            <Button size="sm" icon={<Plus size={15} />}>
              New joiner
            </Button>
          </>
        }
      />

      {source === "preview" ? <PreviewBanner /> : null}

      {loading ? (
        <SkeletonTable rows={6} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {data.kpis.map((k) => (
              <KpiTile
                key={k.key}
                label={k.label}
                value={k.value}
                unit={k.unit}
                tone={k.tone}
                trend={k.trend}
                onClick={() => setDetail(k)}
              />
            ))}
          </div>

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

            <div className="col-span-12 lg:col-span-7">
              <SectionCard title="Today's joining">
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr>
                        {["Employee", "Role", "Progress", "Status", ""].map((h) => (
                          <th
                            key={h}
                            className="border-b border-gray-200 bg-gray-50 px-3.5 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-gray-400 dark:border-gray-800 dark:bg-gray-800/50"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {today.map((j) => (
                        <tr key={j.id} className="border-b border-gray-200 last:border-0 dark:border-gray-800">
                          <td className="px-3.5 py-2.5">
                            <Person name={j.name} meta={j.code} />
                          </td>
                          <td className="px-3.5 py-2.5">
                            {j.role}
                            <br />
                            <small className="text-gray-400">{j.dept}</small>
                          </td>
                          <td className="px-3.5 py-2.5 w-32">
                            <ProgressBar value={j.progress} />
                          </td>
                          <td className="px-3.5 py-2.5">
                            <StatusPill tone={STATUS[j.status][1]}>{STATUS[j.status][0]}</StatusPill>
                          </td>
                          <td className="px-3.5 py-2.5">
                            <Button variant="secondary" size="sm" onClick={() => setDetail(j)}>
                              Open
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            </div>

            <div className="col-span-12 lg:col-span-5">
              <SectionCard title="Department-wise onboarding">
                <div className="p-4">
                  <BarList items={data.byDepartment} />
                </div>
              </SectionCard>
            </div>

            <div className="col-span-12 md:col-span-6 xl:col-span-4">
              <SectionCard title="Weekly statistics">
                <div className="flex flex-col gap-3 p-4">
                  {data.weekly.map((w) => (
                    <div key={w.label} className="flex items-center gap-3">
                      <div className="flex-1">
                        <Eyebrow>{w.label}</Eyebrow>
                        <div className="text-lg font-bold tracking-tight tabular-nums">{w.value}</div>
                      </div>
                      <Sparkline values={w.series} />
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>

            <div className="col-span-12 md:col-span-6 xl:col-span-4">
              <SectionCard
                title="Policy acceptance"
                action={
                  <Link
                    to="/admin/hr/onboarding/policies"
                    className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    All policies
                  </Link>
                }
              >
                <div className="flex flex-col gap-3 p-4">
                  {[
                    { title: "Employee Handbook", version: "v4.2", accepted: 38, total: 45 },
                    { title: "Code of Conduct", version: "v2.1", accepted: 41, total: 45 },
                    { title: "Information Security", version: "v3.0", accepted: 33, total: 45 },
                    { title: "POSH Policy", version: "v2.0", accepted: 44, total: 45 },
                    { title: "Data Privacy & DPDP", version: "v1.3", accepted: 29, total: 45 },
                  ].map((p) => (
                    <div key={p.title}>
                      <div className="mb-1 flex items-baseline gap-2">
                        <b className="text-[12.5px] font-semibold">{p.title}</b>
                        <span className="font-mono text-[11px] text-gray-400">{p.version}</span>
                        <span className="ml-auto text-[11.5px] font-semibold tabular-nums text-gray-500">
                          {p.accepted}/{p.total}
                        </span>
                      </div>
                      <ProgressBar value={(p.accepted / p.total) * 100} showLabel={false} />
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>

            <div className="col-span-12 xl:col-span-4">
              <SectionCard title="Recent activity">
                <div className="p-4">
                  <Timeline items={data.activity} />
                </div>
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
