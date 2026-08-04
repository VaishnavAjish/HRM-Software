import { useMemo, useState } from "react";
import { Boxes, Plus, QrCode } from "lucide-react";
import Button from "../../../../components/ui/Button";
import { SkeletonTable } from "../../../../components/ui/Skeleton";
import DataTable from "../../../../components/onboarding/DataTable";
import PageHeader, { PreviewBanner } from "../../../../components/onboarding/PageHeader";
import {
  Avatar,
  FilterChips,
  Person,
  SectionCard,
  StatusPill,
} from "../../../../components/onboarding/primitives";
import { onboardingApi } from "../../../../utils/onboardingApi";
import { useOnboardingResource } from "../../../../hooks/useOnboardingResource";

const ASSET_STATUS = {
  ALLOCATED: ["Allocated", "info"],
  ACKNOWLEDGED: ["Acknowledged", "ok"],
  PENDING: ["Pending", "warn"],
  PROVISIONING: ["Provisioning", "info"],
};

const PROVISIONING = [
  ["Active Directory", "Provisioned", "ok"],
  ["Microsoft 365 E3", "In progress", "warn"],
  ["VPN access", "Queued", "warn"],
  ["HRMS login", "Provisioned", "ok"],
  ["Git repository", "Not required", "mut"],
];

export default function ItAssets() {
  const { data, source, loading } = useOnboardingResource(
    (token, type) => onboardingApi.getAssets(token, type),
    [],
  );
  const [filter, setFilter] = useState("ALL");

  const assets = useMemo(() => data || [], [data]);
  const filtered = useMemo(
    () => (filter === "ALL" ? assets : assets.filter((a) => a.status === filter)),
    [assets, filter],
  );

  const columns = [
    { key: "name", label: "Asset / account", render: (a) => <b className="font-semibold">{a.name}</b> },
    {
      key: "tag",
      label: "Tag",
      hideBelow: "md",
      render: (a) => <span className="font-mono text-xs">{a.tag}</span>,
    },
    { key: "owner", label: "Assigned to", render: (a) => <Person name={a.owner} /> },
    {
      key: "status",
      label: "Status",
      render: (a) => (
        <StatusPill tone={ASSET_STATUS[a.status][1]}>{ASSET_STATUS[a.status][0]}</StatusPill>
      ),
    },
    {
      key: "date",
      label: "Date",
      render: (a) => <span className="font-mono text-xs text-gray-400">{a.date}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="IT assets & accounts"
        subtitle="34 allocated · 7 pending · 2 awaiting acknowledgement"
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<Boxes size={15} />}>
              Inventory
            </Button>
            <Button size="sm" icon={<Plus size={15} />}>
              Allocate asset
            </Button>
          </>
        }
      />

      {source === "preview" ? <PreviewBanner /> : null}

      {loading ? (
        <SkeletonTable rows={7} />
      ) : (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 xl:col-span-8">
            <SectionCard>
              <div className="flex flex-wrap items-center gap-2 rounded-t-2xl border-b border-gray-200 bg-gray-50 px-3.5 py-3 dark:border-gray-800 dark:bg-gray-800/50">
                <FilterChips
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: "ALL", label: "All", count: assets.length },
                    { value: "ALLOCATED", label: "Allocated" },
                    { value: "ACKNOWLEDGED", label: "Acknowledged" },
                    { value: "PENDING", label: "Pending" },
                    { value: "PROVISIONING", label: "Provisioning" },
                  ]}
                />
                <Button variant="secondary" size="sm" className="ml-auto" icon={<QrCode size={15} />}>
                  Scan QR
                </Button>
              </div>
              <DataTable columns={columns} rows={filtered} rowKey={(a) => a.id} />
            </SectionCard>
          </div>

          <div className="col-span-12 flex flex-col gap-4 xl:col-span-4">
            <SectionCard title="Account provisioning">
              <div className="flex flex-col gap-3 p-4">
                {PROVISIONING.map(([name, state, tone]) => (
                  <div key={name} className="flex items-center gap-3">
                    <b className="flex-1 text-[12.5px] font-semibold">{name}</b>
                    <StatusPill tone={tone}>{state}</StatusPill>
                  </div>
                ))}
                <p className="mt-1 text-[11.5px] text-gray-400 dark:text-gray-500">
                  Provisioning runs through an outbox with idempotency keys, so a retry after a
                  timeout cannot create a second account.
                </p>
              </div>
            </SectionCard>

            <SectionCard title="Pending acknowledgement">
              <div className="flex flex-col gap-3 p-4">
                {assets
                  .filter((a) => a.status === "ALLOCATED")
                  .map((a) => (
                    <div key={a.id} className="flex items-center gap-3">
                      <Avatar name={a.owner} />
                      <div className="min-w-0 flex-1">
                        <b className="block truncate text-[12.5px] font-semibold">{a.name}</b>
                        <small className="text-[11.5px] text-gray-400">{a.owner}</small>
                      </div>
                      <Button variant="secondary" size="sm">
                        Remind
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
