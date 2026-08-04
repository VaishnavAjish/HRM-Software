import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Camera, FileText, Upload } from "lucide-react";
import Button from "../../../../components/ui/Button";
import { SkeletonTable } from "../../../../components/ui/Skeleton";
import SlideOver from "../../../../components/onboarding/SlideOver";
import PageHeader, { PreviewBanner } from "../../../../components/onboarding/PageHeader";
import {
  Avatar,
  EmptyState,
  Eyebrow,
  FilterChips,
  SectionCard,
  StatusPill,
} from "../../../../components/onboarding/primitives";
import { onboardingApi } from "../../../../utils/onboardingApi";
import { useOnboardingResource } from "../../../../hooks/useOnboardingResource";

const DOC_STATUS = {
  VERIFIED: ["Verified", "ok"],
  PENDING: ["Awaiting review", "warn"],
  REJECTED: ["Rejected", "bad"],
  MISSING: ["Not uploaded", "mut"],
  EXPIRING: ["Expiring soon", "bad"],
};

const KIND_COLOR = {
  ID: "#4f46e5",
  BANK: "#059669",
  EDU: "#c026d3",
  EXP: "#ea580c",
  STAT: "#0891b2",
};

export default function DocumentCollection() {
  const { data, source, loading } = useOnboardingResource(
    (token, type) => onboardingApi.getDocuments(token, type),
    [],
  );
  const [filter, setFilter] = useState("ALL");
  const [preview, setPreview] = useState(null);
  const [remarks, setRemarks] = useState("");

  const documents = useMemo(() => data || [], [data]);
  const filtered = useMemo(
    () => (filter === "ALL" ? documents : documents.filter((d) => d.status === filter)),
    [documents, filter],
  );

  const count = (s) => (s === "ALL" ? documents.length : documents.filter((d) => d.status === s).length);

  const review = (decision) => {
    if (decision === "reject" && !remarks.trim()) {
      toast.error("Add a remark so the owner knows what to fix.");
      return;
    }
    toast.success(decision === "approve" ? "Document verified" : "Document rejected");
    setPreview(null);
    setRemarks("");
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Document collection"
        subtitle={`${count("PENDING")} awaiting review · ${count("REJECTED")} rejected · ${count("EXPIRING")} expiring soon`}
        actions={
          <Button size="sm" icon={<Upload size={15} />}>
            Upload
          </Button>
        }
      />

      {source === "preview" ? <PreviewBanner /> : null}

      {loading ? (
        <SkeletonTable rows={6} />
      ) : (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <SectionCard>
              <div className="flex flex-wrap items-center gap-2 rounded-t-2xl border-b border-gray-200 bg-gray-50 px-3.5 py-3 dark:border-gray-800 dark:bg-gray-800/50">
                <FilterChips
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: "ALL", label: "All", count: count("ALL") },
                    { value: "PENDING", label: "Awaiting review", count: count("PENDING") },
                    { value: "VERIFIED", label: "Verified", count: count("VERIFIED") },
                    { value: "REJECTED", label: "Rejected", count: count("REJECTED") },
                    { value: "MISSING", label: "Missing", count: count("MISSING") },
                    { value: "EXPIRING", label: "Expiring", count: count("EXPIRING") },
                  ]}
                />
              </div>
              <div className="p-4">
                {filtered.length ? (
                  <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {filtered.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setPreview(d)}
                        className="flex flex-col gap-2 rounded-[10px] border border-gray-200 bg-white p-2.5 text-left shadow-sm transition hover:border-gray-300 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className="grid h-[38px] w-8 shrink-0 place-items-center rounded font-mono text-[9px] font-bold text-white"
                            style={{ background: KIND_COLOR[d.kind] }}
                          >
                            {d.kind}
                          </span>
                          <span className="min-w-0">
                            <b className="block truncate text-[12.5px] font-semibold">{d.type}</b>
                            <small className="block truncate text-[11px] text-gray-400">{d.owner}</small>
                          </span>
                        </div>
                        <span className="font-mono text-xs text-gray-400">{d.summary}</span>
                        <span className="flex items-center gap-2">
                          <StatusPill tone={DOC_STATUS[d.status][1]}>
                            {DOC_STATUS[d.status][0]}
                          </StatusPill>
                          <small className="ml-auto text-[11px] text-gray-400">{d.uploadedAt}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={FileText}
                    title="Nothing in this state"
                    description="No documents currently match this filter."
                  />
                )}
                <p className="mt-3.5 text-[11.5px] text-gray-400 dark:text-gray-500">
                  Identity numbers are shown masked. Revealing a full Aadhaar is a separate,
                  permissioned action and is written to the audit log.
                </p>
              </div>
            </SectionCard>
          </div>

          <div className="col-span-12 lg:col-span-6">
            <SectionCard title="Upload">
              <div className="p-4">
                <div className="rounded-[10px] border-[1.5px] border-dashed border-gray-300 bg-gray-50 p-6 text-center transition hover:border-brand-400 dark:border-gray-700 dark:bg-gray-800/40">
                  <Upload size={26} strokeWidth={1.5} className="mx-auto text-gray-400" />
                  <b className="mb-1 mt-2.5 block text-[13.5px] font-semibold">
                    Drag files here, or browse
                  </b>
                  <p className="m-0 text-[12.5px] text-gray-500 dark:text-gray-400">
                    PDF, JPG or PNG · up to 10 MB each
                  </p>
                  <div className="mt-3 flex justify-center gap-2">
                    <Button variant="secondary" size="sm">
                      Browse files
                    </Button>
                    <Button variant="secondary" size="sm" icon={<Camera size={15} />}>
                      Use camera
                    </Button>
                  </div>
                </div>
                <p className="mt-3 text-[11.5px] text-gray-400 dark:text-gray-500">
                  Every upload is virus-scanned before it becomes downloadable. Files stay in
                  quarantine until the scan returns clean.
                </p>
              </div>
            </SectionCard>
          </div>

          <div className="col-span-12 lg:col-span-6">
            <SectionCard title="Verification queue">
              <div className="flex flex-col gap-3 p-4">
                {documents
                  .filter((d) => d.status === "PENDING" || d.status === "REJECTED")
                  .map((d) => (
                    <div key={d.id} className="flex items-center gap-3">
                      <Avatar name={d.owner} />
                      <div className="min-w-0 flex-1">
                        <b className="block truncate text-[12.5px] font-semibold">{d.type}</b>
                        <small className="text-[11.5px] text-gray-400">
                          {d.owner} · {d.uploadedAt}
                        </small>
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => setPreview(d)}>
                        Review
                      </Button>
                    </div>
                  ))}
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      <SlideOver
        open={Boolean(preview)}
        title={preview?.type || ""}
        onClose={() => {
          setPreview(null);
          setRemarks("");
        }}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => review("reject")}>
              Reject
            </Button>
            <Button size="sm" onClick={() => review("approve")}>
              Approve
            </Button>
          </>
        }
      >
        {preview ? (
          <>
            <div className="mb-3.5 grid h-52 place-items-center rounded-[10px] border border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-800 dark:bg-gray-800/40">
              <div className="text-center">
                <FileText size={30} strokeWidth={1.5} className="mx-auto" />
                <div className="mt-2 text-[12.5px]">Document preview</div>
              </div>
            </div>
            <div className="mb-3.5 grid grid-cols-2 gap-3">
              {[
                ["Owner", preview.owner],
                ["Uploaded", preview.uploadedAt],
                ["Reference", preview.summary],
                ["Scan", "Clean"],
              ].map(([l, v]) => (
                <div key={l}>
                  <Eyebrow>{l}</Eyebrow>
                  <div className="mt-0.5 text-[13px] font-semibold">{v}</div>
                </div>
              ))}
            </div>
            <label htmlFor="doc-remarks" className="mb-1.5 block text-xs font-semibold">
              Review remarks
            </label>
            <textarea
              id="doc-remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Required when rejecting"
              className="h-20 w-full rounded-lg border border-gray-200 bg-white p-2.5 text-[13px] focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900"
            />
          </>
        ) : null}
      </SlideOver>
    </div>
  );
}
