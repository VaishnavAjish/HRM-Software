import { useEffect, useMemo, useState } from "react";
import { Download, Plus, Users } from "lucide-react";
import Button from "../../../../components/ui/Button";
import Badge from "../../../../components/ui/Badge";
import { SkeletonTable } from "../../../../components/ui/Skeleton";
import DataTable from "../../../../components/onboarding/DataTable";
import SlideOver from "../../../../components/onboarding/SlideOver";
import Timeline from "../../../../components/onboarding/Timeline";
import PageHeader, { PreviewBanner } from "../../../../components/onboarding/PageHeader";
import {
  EmptyState,
  Eyebrow,
  FilterChips,
  Person,
  ProgressBar,
  SectionCard,
  StatusPill,
} from "../../../../components/onboarding/primitives";
import { onboardingApi } from "../../../../utils/onboardingApi";
import { useOnboardingResource } from "../../../../hooks/useOnboardingResource";
import { useAuth } from "../../../../context/AuthContext";
import { hrApi } from "../../../../utils/api";
import { stageLabel, stageColor } from "../hiring/stageMeta";

const STATUS = {
  PRE_BOARDING: ["Pre-boarding", "info"],
  IN_PROGRESS: ["In progress", "warn"],
  PROBATION: ["Probation", "mut"],
  COMPLETED: ["Completed", "ok"],
};

export default function OnboardingJourneys() {
  const { user } = useAuth();
  const { data, source, loading } = useOnboardingResource(
    (token, type) => onboardingApi.getJourneys(token, type),
    [],
  );
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);

  // Also of interest here, even though they're not "journeys" yet — the
  // wider pipeline outcome for anyone past the Interview stage: candidates
  // who were Selected (heading into Offers) or ultimately Rejected. Uses the
  // same stable /hr/candidates endpoint every other Hiring tab uses, not the
  // Onboarding module's own (partly stubbed) backend.
  const [selectedCandidates, setSelectedCandidates] = useState([]);
  const [rejectedCandidates, setRejectedCandidates] = useState([]);
  const [pipelineLoading, setPipelineLoading] = useState(true);

  useEffect(() => {
    if (!user?.accessToken) return;
    Promise.all([
      hrApi.getCandidates(user.accessToken, user.tokenType, { per_page: 50, stage: "selected" }),
      hrApi.getCandidates(user.accessToken, user.tokenType, { per_page: 50, stage: "rejected" }),
    ])
      .then(([selRes, rejRes]) => {
        if (selRes.status) setSelectedCandidates(selRes.data?.data || selRes.data || []);
        if (rejRes.status) setRejectedCandidates(rejRes.data?.data || rejRes.data || []);
      })
      .catch(() => {})
      .finally(() => setPipelineLoading(false));
  }, [user]);

  const journeys = useMemo(() => data || [], [data]);

  const filtered = useMemo(() => {
    if (filter === "ALL") return journeys;
    if (filter === "SLA") return journeys.filter((j) => j.slaBreached);
    return journeys.filter((j) => j.status === filter);
  }, [journeys, filter]);

  const count = (status) =>
    status === "ALL"
      ? journeys.length
      : status === "SLA"
        ? journeys.filter((j) => j.slaBreached).length
        : journeys.filter((j) => j.status === status).length;

  const columns = [
    {
      key: "name",
      label: "Employee",
      render: (j) => <Person name={j.name} meta={j.code} />,
    },
    {
      key: "role",
      label: "Role / Dept",
      render: (j) => (
        <>
          {j.role}
          <br />
          <small className="text-gray-400">{j.dept}</small>
        </>
      ),
    },
    {
      key: "joiningDate",
      label: "Joining",
      hideBelow: "md",
      render: (j) => (
        <>
          {j.joiningDate}
          <br />
          <small className="text-gray-400">{j.location}</small>
        </>
      ),
    },
    {
      key: "mode",
      label: "Mode",
      hideBelow: "md",
      render: (j) => <StatusPill tone="mut">{j.mode}</StatusPill>,
    },
    {
      key: "progress",
      label: "Progress",
      className: "w-36",
      render: (j) => <ProgressBar value={j.progress} />,
    },
    {
      key: "status",
      label: "Status",
      render: (j) => (
        <div className="flex flex-wrap gap-1.5">
          <StatusPill tone={STATUS[j.status][1]}>{STATUS[j.status][0]}</StatusPill>
          {j.slaBreached ? <StatusPill tone="bad">SLA</StatusPill> : null}
        </div>
      ),
    },
    { key: "manager", label: "Manager", hideBelow: "md" },
    {
      key: "actions",
      label: "",
      render: (j) => (
        <Button variant="secondary" size="sm" onClick={() => setSelected(j)}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Journeys"
        subtitle="Every active onboarding journey across the group"
        actions={
          <>
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
        <SkeletonTable rows={8} />
      ) : (
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
          </div>
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(j) => j.id}
            empty={
              <EmptyState
                icon={Users}
                title="No journeys match this filter"
                description="Try a different status, or clear the filter to see every active journey."
                action={
                  <Button variant="secondary" size="sm" onClick={() => setFilter("ALL")}>
                    Clear filter
                  </Button>
                }
              />
            }
          />
        </SectionCard>
      )}

      {/* Wider pipeline context — not "journeys" yet, but useful to see who
          made it to Selected (heading into Offers) or was ultimately
          Rejected, without leaving the Onboarding module. */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6">
          <SectionCard title="Selected — awaiting offer / joining">
            <div className="flex flex-col gap-2.5 p-4">
              {pipelineLoading ? (
                <p className="text-[12.5px] text-gray-400">Loading…</p>
              ) : selectedCandidates.length === 0 ? (
                <EmptyState icon={Users} title="No one currently Selected" description="Candidates marked Selected in Interviews show up here." />
              ) : (
                selectedCandidates.map((c) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <Person name={c.name} meta={c.email || c.phone || ""} />
                    <div className="ml-auto flex items-center gap-2">
                      {c.requisition?.title && <small className="text-[11.5px] text-gray-400">{c.requisition.title}</small>}
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ backgroundColor: `${stageColor(c.stage)}1a`, color: stageColor(c.stage) }}
                      >
                        {stageLabel(c.stage)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>

        <div className="col-span-12 lg:col-span-6">
          <SectionCard title="Rejected">
            <div className="flex flex-col gap-2.5 p-4">
              {pipelineLoading ? (
                <p className="text-[12.5px] text-gray-400">Loading…</p>
              ) : rejectedCandidates.length === 0 ? (
                <EmptyState icon={Users} title="No rejected candidates" description="Anyone rejected at any stage shows up here for the record." />
              ) : (
                rejectedCandidates.map((c) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <Person name={c.name} meta={c.email || c.phone || ""} />
                    <div className="ml-auto flex items-center gap-2">
                      {c.requisition?.title && <small className="text-[11.5px] text-gray-400">{c.requisition.title}</small>}
                      <Badge variant="red">Rejected</Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>
      </div>

      <SlideOver
        open={Boolean(selected)}
        title={selected?.name || ""}
        onClose={() => setSelected(null)}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setSelected(null)}>
              Close
            </Button>
            <Button size="sm">Send reminder</Button>
          </>
        }
      >
        {selected ? (
          <>
            <div className="mb-4">
              <Person name={selected.name} meta={`${selected.code} · ${selected.dept}`} size={40} />
            </div>
            <div className="mb-4 grid grid-cols-2 gap-3">
              {[
                ["Role", selected.role],
                ["Joining", selected.joiningDate],
                ["Mode", selected.mode],
                ["Location", selected.location],
                ["Manager", selected.manager],
                ["Status", STATUS[selected.status][0]],
              ].map(([l, v]) => (
                <div key={l}>
                  <Eyebrow>{l}</Eyebrow>
                  <div className="mt-0.5 text-[13px] font-semibold">{v}</div>
                </div>
              ))}
            </div>
            <Eyebrow>Progress</Eyebrow>
            <div className="mb-4 mt-2">
              <ProgressBar value={selected.progress} />
            </div>
            <Eyebrow>Checklist</Eyebrow>
            <div className="mt-2">
              <Timeline
                items={[
                  { tone: "ok", title: "Offer accepted", at: "01 Aug" },
                  { tone: "ok", title: "Documents submitted", at: "02 Aug" },
                  {
                    tone: selected.progress > 60 ? "ok" : "warn",
                    title: "HR verification",
                    at: selected.progress > 60 ? "03 Aug" : "Pending",
                  },
                  {
                    tone: selected.progress > 80 ? "ok" : "idle",
                    title: "IT provisioning",
                    at: selected.progress > 80 ? "03 Aug" : "Queued",
                  },
                  { tone: "idle", title: "Policy acceptance", at: "Pending" },
                ]}
              />
            </div>
          </>
        ) : null}
      </SlideOver>
    </div>
  );
}
