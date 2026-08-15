import { useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { Pencil, Info, Clock, Users, BarChart3 } from "lucide-react";
import Drawer, { CollapsibleSection } from "../../../../components/ui/Drawer";
import Badge from "../../../../components/ui/Badge";

const STATUS_VARIANT = {
  draft: "gray", pending_approval: "yellow", pending_hr_review: "yellow", pending_director_review: "yellow",
  returned_to_hr: "yellow", revision_requested: "yellow", approved: "blue", published: "green",
  rejected: "red", posted: "green", on_hold: "yellow", closed: "gray", cancelled: "red",
};

const personName = (...values) => values.find((value) => value && typeof value === "object")?.name || "—";

/**
 * Everything here is either a field already on the requisition or computed
 * from its `candidates` relation (only loaded once, for this one job, via
 * JobRequisitionController::show — never precomputed for the whole table).
 */
export default function RequisitionDrawer({ requisition, onClose, onEdit }) {
  const candidates = useMemo(() => requisition?.candidates || [], [requisition]);
  const [openedAt] = useState(() => Date.now());

  const analytics = useMemo(() => {
    if (!requisition) return null;
    const daysOpen = requisition.created_at
      ? Math.floor((openedAt - new Date(requisition.created_at)) / 86400000)
      : null;
    const today = new Date(openedAt).toDateString();
    const applicationsToday = candidates.filter((c) => c.created_at && new Date(c.created_at).toDateString() === today).length;
    const stageBreakdown = candidates.reduce((acc, c) => {
      acc[c.stage] = (acc[c.stage] || 0) + 1;
      return acc;
    }, {});
    return { daysOpen, applicationsToday, stageBreakdown };
  }, [requisition, candidates, openedAt]);

  const timeline = requisition ? [
    { label: "Created", at: requisition.created_at },
    { label: "Approved", at: requisition.approved_at },
    { label: "Posted", at: requisition.posted_at },
    { label: "Target Closing", at: requisition.target_closing_date },
    { label: "Closed", at: requisition.closed_at },
  ].filter((t) => t.at) : [];

  return (
    <Drawer
      isOpen={!!requisition}
      onClose={onClose}
      title={requisition?.title}
      subtitle={requisition?.department?.name}
      size="lg"
      headerExtra={
        requisition && ["draft", "rejected", "revision_requested", "pending_approval", "pending_hr_review"].includes(requisition.status) && (
          <button
            onClick={() => onEdit(requisition)}
            title="Edit"
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
          >
            <Pencil size={16} />
          </button>
        )
      }
    >
      {requisition && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={STATUS_VARIANT[requisition.status] || "gray"}>{requisition.status?.replaceAll("_", " ")}</Badge>
            <Badge variant="blue">{requisition.priority} priority</Badge>
            <Badge variant="gray">{requisition.openings} opening{requisition.openings === 1 ? "" : "s"}</Badge>
          </div>

          <CollapsibleSection title="Overview" icon={<Info size={15} />}>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Detail label="Designation" value={requisition.designation} />
              <Detail label="Employment Type" value={requisition.employment_type?.replace("_", " ")} />
              <Detail label="Department" value={requisition.department?.name} />
              <Detail label="Department Manager" value={requisition.department_manager?.name} />
              <Detail label="Requested By" value={personName(requisition.requested_by, requisition.requestedBy)} />
              <Detail label="HR Manager" value={personName(requisition.hr_manager, requisition.hrManager, requisition.hiring_manager, requisition.hiringManager)} />
              <Detail label="Director" value={personName(requisition.director)} />
              <Detail label="Approved By" value={personName(requisition.approved_by, requisition.approvedBy)} />
              <Detail label="Experience" value={requisition.min_experience != null ? `${requisition.min_experience}–${requisition.max_experience ?? "?"} yrs` : "—"} />
              <Detail label="Salary Range" value={requisition.salary_min ? `₹${Number(requisition.salary_min).toLocaleString("en-IN")} – ₹${Number(requisition.salary_max || 0).toLocaleString("en-IN")}` : "—"} />
            </dl>
            {requisition.description && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Description</p>
                <RichText html={requisition.description} />
              </div>
            )}
            {requisition.requirements && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Requirements</p>
                <RichText html={requisition.requirements} />
              </div>
            )}
          </CollapsibleSection>

          {requisition.current_approval_cycle && (
            <CollapsibleSection title={`Approval Cycle #${requisition.current_approval_cycle.cycle_number}`} icon={<CheckCircleIcon />}>
              <div className="space-y-2">
                {(requisition.current_approval_cycle.steps || []).map((step) => (
                  <div key={step.id} className="rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-gray-700">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-800 dark:text-gray-100">{step.step_type?.replace("_", " ")}</span>
                      <Badge variant={step.status === "APPROVED" ? "green" : step.status === "REJECTED" ? "red" : "yellow"}>{step.status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{personName(step.assigned_user)}{step.decided_at ? ` · ${new Date(step.decided_at).toLocaleString()}` : ""}</p>
                    {step.comment && <p className="mt-1 text-xs text-gray-700 dark:text-gray-300">{step.comment}</p>}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          <CollapsibleSection title="Hiring Timeline" icon={<Clock size={15} />}>
            {timeline.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-2">No timeline events yet</p>
            ) : (
              <div className="space-y-2">
                {timeline.map((t) => (
                  <div key={t.label} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-300">{t.label}</span>
                    <span className="text-gray-400 text-xs">{new Date(t.at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Candidates" icon={<Users size={15} />} count={candidates.length}>
            {candidates.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-2">No candidates linked to this requisition yet</p>
            ) : (
              <div className="space-y-2">
                {candidates.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 dark:border-gray-700 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.current_designation || "—"} · {c.experience_years ?? 0} yrs</p>
                    </div>
                    <Badge variant="blue" className="flex-shrink-0">{(c.stage || "").replace("_", " ")}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Analytics" icon={<BarChart3 size={15} />}>
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Days Open" value={analytics.daysOpen ?? "—"} />
              <MiniStat label="Applications Today" value={analytics.applicationsToday} />
            </div>
            {Object.keys(analytics.stageBreakdown).length > 0 && (
              <div className="mt-3 space-y-1.5">
                {Object.entries(analytics.stageBreakdown).map(([stage, count]) => (
                  <div key={stage} className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400 capitalize">{stage.replace("_", " ")}</span>
                    <span className="font-semibold text-gray-700 dark:text-gray-200">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>
        </div>
      )}
    </Drawer>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-gray-400 dark:text-gray-500">{label}</dt>
      <dd className="text-gray-800 dark:text-gray-100 font-medium">{value || "—"}</dd>
    </div>
  );
}

/** Description/Requirements are rich-text HTML from RichTextEditor going
 *  forward, but requisitions saved before that change hold plain text —
 *  render HTML as HTML, and fall back to preserving line breaks for the
 *  plain-text case instead of collapsing it into one run-on paragraph. */
function RichText({ html }) {
  const isHtml = /<[a-z][\s\S]*>/i.test(html || "");
  if (isHtml) {
    return (
      <div
        className="text-sm text-gray-700 dark:text-gray-300 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h2]:font-bold [&_h2]:mt-2"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
      />
    );
  }
  return <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{html}</p>;
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-900/30 px-3 py-2">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function CheckCircleIcon() {
  return <span aria-hidden="true" className="text-brand-600">✓</span>;
}
