import { AlertTriangle, Briefcase, Users } from "lucide-react";
import Button from "../../../../components/ui/Button";
import { SkeletonTable } from "../../../../components/ui/Skeleton";
import Stepper from "../../../../components/onboarding/Stepper";
import Timeline from "../../../../components/onboarding/Timeline";
import {
  EmptyState,
  Person,
  ProgressBar,
  SectionCard,
  StatusPill,
} from "../../../../components/onboarding/primitives";

const STATUS = {
  PRE_BOARDING: ["Pre-boarding", "info"],
  IN_PROGRESS: ["In progress", "warn"],
  PROBATION: ["Probation", "mut"],
  COMPLETED: ["Completed", "ok"],
};

function jobRowToEmployee(c) {
  return {
    id: c.id,
    name: c.name,
    code: c.code,
    role: c.role,
    dept: c.dept,
    joiningDate: c.joiningDate,
    location: c.location || "—",
    mode: c.mode || "—",
    manager: c.manager || "—",
    progress: c.progress,
    status: c.status,
    slaBreached: false,
  };
}

export default function OverviewTab({ data, loading, error, reload, onOpenEmployee, onFilterStage }) {
  if (loading) return <SkeletonTable rows={8} />;

  if (error || !data) {
    return (
      <SectionCard>
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load the onboarding overview"
          description="The server didn't return any data. Please try again."
          action={
            <Button variant="secondary" size="sm" onClick={reload}>
              Retry
            </Button>
          }
        />
      </SectionCard>
    );
  }

  const funnel = data.funnel || [];
  const top = funnel[0]?.value || 0;

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Onboarding pipeline">
        <div className="p-4">
          {funnel.length === 0 ? (
            <EmptyState icon={Users} title="No one onboarding yet" description="This fills in the moment a candidate's offer is accepted." />
          ) : (
            <div className="flex flex-col gap-3">
              {funnel.map((stage) => {
                const pct = top ? Math.round((stage.value / top) * 100) : 0;
                return (
                  <button
                    key={stage.label}
                    type="button"
                    onClick={() => onFilterStage?.(stage.label)}
                    className="flex items-center gap-3 rounded-lg p-1.5 text-left transition hover:bg-gray-50 dark:hover:bg-gray-800/40"
                  >
                    <span className="w-44 shrink-0 text-[13px] font-medium text-gray-700 dark:text-gray-200">
                      {stage.label}
                    </span>
                    <div className="flex-1">
                      <ProgressBar value={pct} showLabel={false} />
                    </div>
                    <span className="w-10 text-right text-xs font-semibold tabular-nums text-gray-500 dark:text-gray-400">
                      {pct}%
                    </span>
                    <span className="w-8 text-right text-sm font-bold tabular-nums">{stage.value}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </SectionCard>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-8">
          <SectionCard title="Joining calendar — next 7 days">
            <div className="p-4">
              <Stepper steps={data.joiningWeek || []} />
              <div className="mt-4 flex flex-col gap-2">
                {(data.todayJoining || []).length === 0 ? (
                  <p className="text-[12.5px] text-gray-400">No one joining today.</p>
                ) : (
                  <>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      Joining today ({data.todayJoining.length})
                    </p>
                    {data.todayJoining.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onOpenEmployee?.(jobRowToEmployee({ ...c, joiningDate: "Today" }))}
                        className="flex items-center gap-3 rounded-lg p-1.5 text-left transition hover:bg-gray-50 dark:hover:bg-gray-800/40"
                      >
                        <Person name={c.name} meta={c.role} />
                        <span className="ml-auto">
                          <StatusPill tone={STATUS[c.status]?.[1] || "mut"}>{STATUS[c.status]?.[0] || c.status}</StatusPill>
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="col-span-12 xl:col-span-4">
          <SectionCard title="Recent activity">
            <div className="p-4">
              <Timeline items={(data.activity || []).map((a) => ({ ...a, at: a.at }))} />
            </div>
          </SectionCard>
        </div>
      </div>

      <SectionCard
        title={`Candidates onboarding — by job${data.candidatesByJob?.length ? ` (${data.candidatesByJob.length})` : ""}`}
      >
        {!data.candidatesByJob || data.candidatesByJob.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Briefcase}
              title="No one's onboarding yet"
              description="This fills in automatically the moment a candidate is marked Offer Accepted in Hiring → Offer."
            />
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
                            <StatusPill tone={STATUS[c.status]?.[1] || "mut"}>{STATUS[c.status]?.[0] || c.status}</StatusPill>
                          </td>
                          <td className="px-3.5 py-2.5">
                            <Button variant="secondary" size="sm" onClick={() => onOpenEmployee?.(jobRowToEmployee(c))}>
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
  );
}
