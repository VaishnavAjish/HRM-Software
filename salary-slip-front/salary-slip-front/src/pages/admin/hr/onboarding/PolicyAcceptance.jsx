import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { BellRing, Upload } from "lucide-react";
import Button from "../../../../components/ui/Button";
import Modal from "../../../../components/ui/Modal";
import { SkeletonTable } from "../../../../components/ui/Skeleton";
import DataTable from "../../../../components/onboarding/DataTable";
import Timeline from "../../../../components/onboarding/Timeline";
import PageHeader, { PreviewBanner } from "../../../../components/onboarding/PageHeader";
import {
  Eyebrow,
  FilterChips,
  ProgressBar,
  SectionCard,
  StatusPill,
} from "../../../../components/onboarding/primitives";
import { onboardingApi } from "../../../../utils/onboardingApi";
import { useOnboardingResource } from "../../../../hooks/useOnboardingResource";

export default function PolicyAcceptance() {
  const { data, source, loading } = useOnboardingResource(
    (token, type) => onboardingApi.getPolicies(token, type),
    [],
  );
  const [filter, setFilter] = useState("ALL");
  const [reading, setReading] = useState(null);
  const [agreed, setAgreed] = useState(false);

  const policies = useMemo(() => data || [], [data]);
  const filtered = useMemo(() => {
    if (filter === "MANDATORY") return policies.filter((p) => p.mandatory);
    if (filter === "OPTIONAL") return policies.filter((p) => !p.mandatory);
    if (filter === "OUTSTANDING") return policies.filter((p) => p.accepted < p.total);
    return policies;
  }, [policies, filter]);

  const accept = () => {
    toast.success("Policy accepted — signature recorded");
    setReading(null);
    setAgreed(false);
  };

  const columns = [
    { key: "title", label: "Policy", render: (p) => <b className="font-semibold">{p.title}</b> },
    {
      key: "version",
      label: "Version",
      render: (p) => <span className="font-mono text-xs">{p.version}</span>,
    },
    {
      key: "mandatory",
      label: "Type",
      render: (p) => (
        <StatusPill tone={p.mandatory ? "info" : "mut"}>
          {p.mandatory ? "Mandatory" : "Optional"}
        </StatusPill>
      ),
    },
    {
      key: "accepted",
      label: "Acceptance",
      className: "w-40",
      render: (p) => <ProgressBar value={(p.accepted / p.total) * 100} />,
    },
    {
      key: "outstanding",
      label: "Outstanding",
      hideBelow: "md",
      render: (p) => <span className="tabular-nums">{p.total - p.accepted}</span>,
    },
    {
      key: "actions",
      label: "",
      render: (p) => (
        <Button variant="secondary" size="sm" onClick={() => setReading(p)}>
          Read
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Policy acceptance"
        subtitle="233 acceptances recorded · 6 outstanding across 8 policies"
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<BellRing size={15} />}>
              Send reminders
            </Button>
            <Button size="sm" icon={<Upload size={15} />}>
              Publish policy
            </Button>
          </>
        }
      />

      {source === "preview" ? <PreviewBanner /> : null}

      {loading ? (
        <SkeletonTable rows={8} />
      ) : (
        <>
          <SectionCard>
            <div className="flex flex-wrap items-center gap-2 rounded-t-2xl border-b border-gray-200 bg-gray-50 px-3.5 py-3 dark:border-gray-800 dark:bg-gray-800/50">
              <FilterChips
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "ALL", label: "All", count: policies.length },
                  { value: "MANDATORY", label: "Mandatory" },
                  { value: "OPTIONAL", label: "Optional" },
                  { value: "OUTSTANDING", label: "Outstanding" },
                ]}
              />
            </div>
            <DataTable columns={columns} rows={filtered} rowKey={(p) => p.id} />
          </SectionCard>

          <SectionCard title="Acceptance audit trail">
            <div className="p-4">
              <Timeline
                items={[
                  {
                    tone: "ok",
                    title: "POSH Policy v2.0 accepted",
                    description: "Fatima Sheikh · e-signature 4f9c…a21 · 103.21.44.7",
                    at: "5 h ago",
                  },
                  {
                    tone: "ok",
                    title: "Code of Conduct v2.1 accepted",
                    description: "Priya Nair · e-signature 8b1e…77d · 103.21.44.7",
                    at: "Yesterday",
                  },
                  {
                    tone: "brand",
                    title: "Data Privacy v1.3 published",
                    description: "by Meera Kulkarni · supersedes v1.2",
                    at: "2 days ago",
                  },
                ]}
              />
              <p className="mt-1.5 text-[11.5px] text-gray-400 dark:text-gray-500">
                Acceptance records are append-only. They cannot be edited or deleted after signing.
              </p>
            </div>
          </SectionCard>
        </>
      )}

      <Modal
        isOpen={Boolean(reading)}
        onClose={() => {
          setReading(null);
          setAgreed(false);
        }}
        title={reading?.title || ""}
      >
        {reading ? (
          <div>
            <Eyebrow>{`Version ${reading.version} · effective 01 July 2026`}</Eyebrow>
            <div className="my-2.5 max-h-56 overflow-auto rounded-[10px] border border-gray-200 bg-gray-50 p-3.5 text-[13px] leading-relaxed dark:border-gray-800 dark:bg-gray-800/40">
              <p className="mt-0">
                <b>1. Purpose.</b> This document sets out the terms, expectations and entitlements
                that apply to all employees of the Nidhi Impex group.
              </p>
              <p>
                <b>2. Working hours.</b> Standard hours are 9:00 to 18:00, Monday to Friday, with a
                45-minute break. Plant shifts follow the roster published by the unit head.
              </p>
              <p>
                <b>3. Conduct.</b> Employees are expected to act with integrity and to treat
                colleagues, contractors and visitors with respect at all times.
              </p>
              <p className="mb-0">
                <b>4. Amendment.</b> This document may be amended with 30 days&apos; notice.
                Continued employment constitutes acceptance of the current version.
              </p>
            </div>
            <label className="flex items-start gap-2.5 text-[12.5px]">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I have read and accept this policy. My acceptance will be recorded with a timestamp,
                my IP address and an e-signature reference.
              </span>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setReading(null)}>
                Close
              </Button>
              <Button size="sm" disabled={!agreed} onClick={accept}>
                Accept policy
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
