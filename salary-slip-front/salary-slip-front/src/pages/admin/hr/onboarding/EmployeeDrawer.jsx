import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import Button from "../../../../components/ui/Button";
import SlideOver from "../../../../components/onboarding/SlideOver";
import Timeline from "../../../../components/onboarding/Timeline";
import {
  Eyebrow,
  Person,
  ProgressBar,
  StatusPill,
} from "../../../../components/onboarding/primitives";
import { hrApi } from "../../../../utils/api";
import { useAuth } from "../../../../context/AuthContext";

const STATUS = {
  PRE_BOARDING: ["Pre-boarding", "info"],
  IN_PROGRESS: ["In progress", "warn"],
  PROBATION: ["Probation", "mut"],
  COMPLETED: ["Completed", "ok"],
};

/** Shared employee side panel — used by both the Employees tab and the
 *  Overview tab's joining lists, so opening the same person from either
 *  place shows the same real data instead of two half-built drawers. */
export default function EmployeeDrawer({ employee, onClose }) {
  const { user } = useAuth();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    if (!employee?.id) return;
    setLoading(true);
    hrApi.getCandidateDocuments(employee.id, user.accessToken, user.tokenType)
      .then((res) => { if (res.status) setDocs(res.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [employee?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const reviewDoc = async (id, decision) => {
    try {
      const res = await hrApi.reviewCandidateDocument(id, decision, undefined, user.accessToken, user.tokenType);
      if (res.status) { toast.success(decision === "approve" ? "Document verified" : "Document rejected"); load(); }
    } catch (err) {
      toast.error(err.message || "Failed to update document status");
    }
  };

  const removeDoc = async (id) => {
    if (!window.confirm("Delete this document?")) return;
    try {
      const res = await hrApi.deleteCandidateDocument(id, user.accessToken, user.tokenType);
      if (res.status) { toast.success("Document deleted"); load(); }
    } catch (err) {
      toast.error(err.message || "Failed to delete");
    }
  };

  // Real, chronological — built from actual upload/review timestamps rather
  // than a fixed set of stub stages.
  const timelineItems = [
    ...docs.flatMap((d) => {
      const items = [{
        tone: "brand",
        title: `${d.document_type} uploaded`,
        description: d.uploaded_by?.name ? `by ${d.uploaded_by.name}` : undefined,
        at: d.created_at ? new Date(d.created_at).toLocaleString() : "",
        ts: d.created_at ? new Date(d.created_at).getTime() : 0,
      }];
      if (d.reviewed_at) {
        items.push({
          tone: d.status === "VERIFIED" ? "ok" : "bad",
          title: `${d.document_type} ${d.status === "VERIFIED" ? "verified" : "rejected"}`,
          description: d.reviewed_by?.name ? `by ${d.reviewed_by.name}` : undefined,
          at: new Date(d.reviewed_at).toLocaleString(),
          ts: new Date(d.reviewed_at).getTime(),
        });
      }
      return items;
    }),
  ].sort((a, b) => b.ts - a.ts);

  if (employee?.joiningDate && employee.joiningDate !== "TBD") {
    timelineItems.push({ tone: "idle", title: "Joining scheduled", at: employee.joiningDate, ts: -1 });
  }

  return (
    <SlideOver
      open={Boolean(employee)}
      title={employee?.name || ""}
      onClose={onClose}
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      {employee ? (
        <>
          <div className="mb-4">
            <Person name={employee.name} meta={`${employee.code} · ${employee.dept}`} size={40} />
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            {[
              ["Role", employee.role],
              ["Joining", employee.joiningDate],
              ["Mode", employee.mode],
              ["Location", employee.location],
              ["Manager", employee.manager || "—"],
              ["Status", STATUS[employee.status]?.[0] || employee.status],
            ].map(([l, v]) => (
              <div key={l}>
                <Eyebrow>{l}</Eyebrow>
                <div className="mt-0.5 text-[13px] font-semibold">{v}</div>
              </div>
            ))}
          </div>

          {employee.slaBreached ? (
            <div className="mb-4">
              <StatusPill tone="bad">SLA breached</StatusPill>
            </div>
          ) : null}

          <Eyebrow>Progress</Eyebrow>
          <div className="mb-5 mt-2">
            <ProgressBar value={employee.progress} />
          </div>

          <Eyebrow>Documents</Eyebrow>
          <div className="mb-5 mt-2 flex flex-col gap-2.5">
            {loading ? (
              <p className="text-[12.5px] text-gray-400">Loading…</p>
            ) : docs.length === 0 ? (
              <p className="text-[12.5px] text-gray-400">Nothing uploaded yet.</p>
            ) : (
              docs.map((d) => (
                <div key={d.id} className="flex items-center gap-2.5 rounded-lg border border-gray-200 p-2.5 dark:border-gray-800">
                  <div className="min-w-0 flex-1">
                    <a href={d.url} target="_blank" rel="noreferrer" className="block truncate text-[12.5px] font-semibold text-brand-600 hover:underline">
                      {d.document_type}
                    </a>
                    <small className="text-[11px] text-gray-400">{d.original_filename}</small>
                  </div>
                  <StatusPill tone={d.status === "VERIFIED" ? "ok" : d.status === "REJECTED" ? "bad" : "warn"}>
                    {d.status === "VERIFIED" ? "Verified" : d.status === "REJECTED" ? "Rejected" : "Pending"}
                  </StatusPill>
                  {d.status === "PENDING" && (
                    <>
                      <button title="Verify" onClick={() => reviewDoc(d.id, "approve")} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20">
                        <ThumbsUp size={13} />
                      </button>
                      <button title="Reject" onClick={() => reviewDoc(d.id, "reject")} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                        <ThumbsDown size={13} />
                      </button>
                    </>
                  )}
                  <button title="Delete" onClick={() => removeDoc(d.id)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>

          <Eyebrow>Timeline</Eyebrow>
          <div className="mt-2">
            <Timeline items={timelineItems} />
          </div>
        </>
      ) : null}
    </SlideOver>
  );
}
