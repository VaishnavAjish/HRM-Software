import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock3, Eye, Search, Send, RotateCcw, Edit2 } from "lucide-react";
import toast from "react-hot-toast";
import DOMPurify from "dompurify";
import Badge from "../../../../components/ui/Badge";
import Button from "../../../../components/ui/Button";
import Modal from "../../../../components/ui/Modal";
import Pagination from "../../../../components/ui/Pagination";
import { SkeletonTable } from "../../../../components/ui/Skeleton";
import { useAuth } from "../../../../context/AuthContext";
import { useCompany } from "../../../../context/CompanyContext";
import { useAuthorization } from "../../../../hooks/useAuthorization";
import RequisitionFormModal from "./RequisitionFormModal";
import { hrApi } from "../../../../utils/api";

const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const FILTERS = [
  { key: "awaiting", label: "Awaiting My Review", icon: Clock3 },
  { key: "approved", label: "Processed by Me", icon: CheckCircle2 },
];

const date = (value) => value ? new Date(value).toLocaleString() : "—";
const money = (value) => value == null || value === "" ? "—" : `₹${Number(value).toLocaleString("en-IN")}`;
const person = (value) => value?.name || "—";

export default function ApprovalReviewTab({ kind, departments = [], people = [], openRequisitionForm }) {
  const { user } = useAuth();
  const { companyScope, scopeKey } = useCompany();
  const { can } = useAuthorization();
  const isDirector = kind === "director";
  const label = isDirector ? "Director" : "HR Manager";

    const [searchParams, setSearchParams] = useSearchParams();
  const decidePermission = isDirector
    ? "ui.hr.hiring.director_review.decide"
    : "ui.hr.hiring.hr_manager_review.decide";

  const [filter, setFilter] = useState("awaiting");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({ awaiting: 0, approved: 0 });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);

  // HR Manager Action Modals
  const [forwardModalOpen, setForwardModalOpen] = useState(false);
  const [directorId, setDirectorId] = useState("");
  const [eligibleDirectors, setEligibleDirectors] = useState([]);
  const [directorsLoading, setDirectorsLoading] = useState(false);

  const [returnDeptHeadModalOpen, setReturnDeptHeadModalOpen] = useState(false);
  const [returnDirectorModalOpen, setReturnDirectorModalOpen] = useState(false);

  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = () => {
    if (!user?.accessToken) return;
    setLoading(true);
    setError("");
    const apiKind = isDirector ? "director" : "hr-manager";
    hrApi.getRequisitionApprovalQueue(apiKind, user.accessToken, user.tokenType, {
      company_code: companyScope?.companyId,
      unit: companyScope?.unit,
      status: filter,
      search: debouncedSearch || undefined,
      page,
      per_page: perPage,
    })
      .then((response) => {
        const payload = response?.data || {};
        setRows(payload.data || []);
        setTotal(payload.total || 0);
        setCounts(response?.counts || { awaiting: 0, approved: 0 });
      })
      .catch((requestError) => setError(requestError.message || "Unable to load approval queue."))
      .finally(() => setLoading(false));
  };

  useEffect(load, [user, kind, scopeKey, filter, debouncedSearch, page, perPage]);

  const openDetails = async (step) => {
    setSelected(step);
    setHistory([]);
    const requisition = step?.cycle?.requisition;
    if (!requisition) return;
    try {
      const response = await hrApi.getRequisitionApprovalHistory(requisition.id, user.accessToken, user.tokenType);
      if (response.status) setHistory(response.data || []);
    } catch (requestError) {
      toast.error(requestError.message || "Could not load approval history");
    }
  };

  const openForwardModal = async () => {
    const req = selected?.cycle?.requisition;
    if (!req) return;
    setDirectorId("");
    setEligibleDirectors([]);
    setDirectorsLoading(true);
    setForwardModalOpen(true);
    try {
      const res = await hrApi.getRequisitionApprovalOptions(req.id, user.accessToken, user.tokenType, {
        company_code: companyScope?.companyId,
        unit: companyScope?.unit,
        type: "director",
      });
      if (res.status) {
        setEligibleDirectors(res.data?.directors || res.data?.approvers || []);
      }
    } catch (err) {
      toast.error(err.message || "Failed to load eligible Directors");
    } finally {
      setDirectorsLoading(false);
    }
  };

  const handleForwardToDirector = async () => {
    
    const req = selected?.cycle?.requisition;
    if (!req) return;
    setSaving(true);
    try {
      const res = await hrApi.hrManagerForward(req.id, {
        director_id: null,
        comment: comment.trim() || undefined,
      }, user.accessToken, user.tokenType);
      if (res.status) {
        toast.success("Requisition forwarded to Director!");
        setForwardModalOpen(false);
        setSelected(null);
        setComment("");
        load();
      }
    } catch (err) {
      toast.error(err.message || "Failed to forward requisition");
    } finally {
      setSaving(false);
    }
  };

  const handleReturnToDeptHead = async () => {
    if (comment.trim().length < 5) {
      toast.error("Please provide a substantive comment (at least 5 characters).");
      return;
    }
    const req = selected?.cycle?.requisition;
    if (!req) return;
    setSaving(true);
    try {
      const res = await hrApi.hrManagerReturn(req.id, {
        comment: comment.trim(),
      }, user.accessToken, user.tokenType);
      if (res.status) {
        toast.success("Requisition returned to Department Head");
        setReturnDeptHeadModalOpen(false);
        setSelected(null);
        setComment("");
        load();
      }
    } catch (err) {
      toast.error(err.message || "Failed to return requisition");
    } finally {
      setSaving(false);
    }
  };

  const handleRespondToDirector = async () => {
    const req = selected?.cycle?.requisition;
    if (!req) return;
    setSaving(true);
    try {
      const res = await hrApi.hrManagerRespond(req.id, {
        comment: comment.trim() || undefined,
      }, user.accessToken, user.tokenType);
      if (res.status) {
        toast.success("Requisition re-forwarded to Director");
        setSelected(null);
        setComment("");
        load();
      }
    } catch (err) {
      toast.error(err.message || "Failed to respond to Director");
    } finally {
      setSaving(false);
    }
  };

  const handleDirectorDecision = async (decisionType) => {
    if (decisionType === "returned" && comment.trim().length < 5) {
      toast.error("Please provide a substantive comment (at least 5 characters) when returning to HR.");
      return;
    }
    const req = selected?.cycle?.requisition;
    if (!req) return;
    setSaving(true);
    try {
      const res = await hrApi.directorDecision(req.id, {
        decision: decisionType,
        comment: comment.trim() || undefined,
      }, user.accessToken, user.tokenType);
      if (res.status) {
        toast.success(decisionType === "approved" ? "Requisition approved by Director!" : "Requisition returned to HR Manager");
        setReturnDirectorModalOpen(false);
        setSelected(null);
        setComment("");
        load();
      }
    } catch (err) {
      toast.error(err.message || "Failed to record decision");
    } finally {
      setSaving(false);
    }
  };

  const snapshot = selected?.cycle?.snapshot || {};
  const requisition = selected?.cycle?.requisition;
  const requisitionData = snapshot.requisition || requisition || {};
  const isPending = selected?.status === "PENDING";
  const reqStatus = requisition?.status;

  const statusVariant = useMemo(() => ({ PENDING: "yellow", APPROVED: "green", RETURNED: "yellow", REJECTED: "red" }), []);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
        {FILTERS.map(({ key, label: filterLabel, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => { setFilter(key); setPage(1); }}
            aria-pressed={filter === key}
            className={`rounded-xl border p-4 text-left transition-colors ${filter === key
              ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20"
              : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800"}`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{filterLabel}</span>
              <Icon size={18} className="text-brand-600 dark:text-brand-400" aria-hidden="true" />
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{counts[key] || 0}</p>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">{label} Requisition Reviews</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Requisitions requiring your {label} review.</p>
          </div>
          <label className="relative block w-full sm:w-72">
            <Search size={16} className="absolute left-3 top-2.5 text-gray-400" aria-hidden="true" />
            <input className={`${inputClass} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search requisitions..." />
          </label>
        </div>

        {loading ? <div className="p-4"><SkeletonTable rows={5} cols={7} /></div> : error ? (
          <div className="p-10 text-center">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <Button className="mt-3" variant="secondary" onClick={load}>Try again</Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500 dark:text-gray-400">No requisitions in this queue.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3">Requisition</th>
                  <th className="px-4 py-3">Requested By</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Openings</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {rows.map((step) => {
                  const req = step.cycle?.requisition || {};
                  const snap = step.cycle?.snapshot || {};
                  return (
                    <tr key={step.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{req.title || snap.requisition?.title || "—"}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{person(snap.requested_by || req.requested_by)}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{snap.department?.name || req.department?.name || "—"}</td>
                      <td className="px-4 py-3"><Badge variant={statusVariant[step.status] || "gray"}>{req.status?.replaceAll("_", " ") || step.status}</Badge></td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{snap.requisition?.openings ?? req.openings ?? "—"}</td>
                      <td className="px-4 py-3"><Badge variant={req.priority === "urgent" ? "red" : "blue"}>{req.priority || snap.requisition?.priority || "—"}</Badge></td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{date(step.cycle?.submitted_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => openDetails(step)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 font-semibold text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-900/20">
                          <Eye size={15} /> Review
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4"><Pagination current={page} total={total} pageSize={perPage} onChange={setPage} onPageSizeChange={(value) => { setPerPage(value); setPage(1); }} /></div>
      </div>

      
      {/* HR Manager gets the Editable Form */}
      {!isDirector && (
        <RequisitionFormModal
          isOpen={Boolean(selected)}
          targetId={selected?.cycle?.requisition?.id || selected?.requisition_id}
          titleOverride={`${label} Review — ${selected?.cycle?.requisition?.title || "Requisition"}`}
          onClose={() => { setSelected(null); setComment(""); }}
          onSuccess={() => load()}
          initialDepartments={departments}
          extraFooter={
            isPending && can(decidePermission) ? (
              <>
                {reqStatus === "returned_to_hr" ? (
                  <Button onClick={handleRespondToDirector} disabled={saving}>
                    <Send size={14} className="mr-1" /> Re-forward to Director
                  </Button>
                ) : (
                  <>
                    <Button variant="secondary" onClick={() => setReturnDeptHeadModalOpen(true)} disabled={saving}>
                      <RotateCcw size={14} className="mr-1" /> Return to Dept Head
                    </Button>
                    <Button onClick={openForwardModal} disabled={saving}>
                      <Send size={14} className="mr-1" /> Forward to Director
                    </Button>
                  </>
                )}
              </>
            ) : null
          }
          extraContent={
            <div className="space-y-5">
              {isPending && (
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">
                    Review Comments / Notes
                  </label>
                  <textarea
                    className={`${inputClass} min-h-20`}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add review notes or comments..."
                  />
                </div>
              )}
              <section>
                <h3 className="font-semibold text-gray-900 dark:text-white">Approval History</h3>
                <div className="mt-3 space-y-3">
                  {history.length === 0 ? <p className="text-sm text-gray-500">History loading...</p> : history.map((cycle) => (
                    <div key={cycle.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">Cycle #{cycle.cycle_number}</span>
                        <Badge variant={statusVariant[cycle.status] || "gray"}>{cycle.status}</Badge>
                      </div>
                      <div className="mt-3 space-y-2">
                        {(cycle.steps || []).map((step) => (
                          <p key={step.id} className="text-sm text-gray-600 dark:text-gray-300">
                            <span className="font-medium">{step.step_type?.replace("_", " ")}</span>: {step.status} · {person(step.decision_actor || step.assigned_user)}{step.decided_at ? ` · ${date(step.decided_at)}` : ""}
                            {step.comment ? ` — "${step.comment}"` : ""}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          }
        />
      )}

      {/* Director gets the Static View Modal */}
      {isDirector && selected?.cycle?.requisition && (
        <Modal
          isOpen={Boolean(selected)}
          onClose={() => { setSelected(null); setComment(""); }}
          title={`Director Review — ${selected.cycle.requisition.title}`}
          size="xl"
          footer={
            isPending && can(decidePermission) ? (
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setReturnDirectorModalOpen(true)} disabled={saving}>
                  <RotateCcw size={14} className="mr-1" /> Return to HR Manager
                </Button>
                <Button onClick={() => handleDirectorDecision("approved")} disabled={saving}>
                  <CheckCircle2 size={14} className="mr-1" /> Approve Requisition
                </Button>
              </div>
            ) : null
          }
        >
          <div className="space-y-6">
            <section className="rounded-xl border border-gray-200 bg-gray-50/50 p-5 dark:border-gray-700 dark:bg-gray-800/50">
              <h3 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">Core Details</h3>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
                <Detail label="Job Title" value={selected.cycle.requisition.title} />
                <Detail label="Department" value={departments.find(d => d.id === selected.cycle.requisition.department_id)?.name || selected.cycle.requisition.department?.name} />
                <Detail label="Openings" value={selected.cycle.requisition.total_openings} />
                <Detail label="Employment Type" value={selected.cycle.requisition.employment_type} />
                <Detail label="Priority" value={<Badge variant={selected.cycle.requisition.priority === "urgent" ? "red" : selected.cycle.requisition.priority === "high" ? "orange" : selected.cycle.requisition.priority === "medium" ? "blue" : "gray"}>{selected.cycle.requisition.priority}</Badge>} />
                <Detail label="Target Joining" value={selected.cycle.requisition.target_joining_date ? date(selected.cycle.requisition.target_joining_date) : null} />
                <Detail label="Experience" value={selected.cycle.requisition.min_experience_years ? `${selected.cycle.requisition.min_experience_years} - ${selected.cycle.requisition.max_experience_years} years` : null} />
                <Detail label="Salary" value={selected.cycle.requisition.min_salary ? `${selected.cycle.requisition.min_salary} - ${selected.cycle.requisition.max_salary}` : null} />
              </div>
            </section>

            <section className="space-y-6">
              <TextBlock label="Job Description" html={selected.cycle.requisition.job_description} />
              <TextBlock label="Requirements" html={selected.cycle.requisition.requirements} />
            </section>

            {isPending && (
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">
                  Review Comments / Notes
                </label>
                <textarea
                  className={`${inputClass} min-h-20`}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add review notes or comments..."
                />
              </div>
            )}

            <section>
              <h3 className="font-semibold text-gray-900 dark:text-white">Approval History</h3>
              <div className="mt-3 space-y-3">
                {history.length === 0 ? <p className="text-sm text-gray-500">History loading...</p> : history.map((cycle) => (
                  <div key={cycle.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">Cycle #{cycle.cycle_number}</span>
                      <Badge variant={statusVariant[cycle.status] || "gray"}>{cycle.status}</Badge>
                    </div>
                    <div className="mt-3 space-y-2">
                      {(cycle.steps || []).map((step) => (
                        <p key={step.id} className="text-sm text-gray-600 dark:text-gray-300">
                          <span className="font-medium">{step.step_type?.replace("_", " ")}</span>: {step.status} · {person(step.decision_actor || step.assigned_user)}{step.decided_at ? ` · ${date(step.decided_at)}` : ""}
                          {step.comment ? ` — "${step.comment}"` : ""}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </Modal>
      )}

      {/* Forward to Director Modal */}
      <Modal
        isOpen={forwardModalOpen}
        onClose={() => !saving && setForwardModalOpen(false)}
        title="Forward Requisition to Director"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setForwardModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleForwardToDirector} disabled={saving}>
              {saving ? "Forwarding..." : "Forward to Director"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">This requisition will be forwarded to the Director pool for final approval.</p>
          </div>
      </Modal>

      {/* Return to Department Head Modal */}
      <Modal
        isOpen={returnDeptHeadModalOpen}
        onClose={() => !saving && setReturnDeptHeadModalOpen(false)}
        title="Return to Department Head"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReturnDeptHeadModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleReturnToDeptHead} disabled={saving || comment.trim().length < 5}>
              {saving ? "Returning..." : "Return to Dept Head"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">Return this requisition to the Department Head for updates or clarification.</p>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Reason / Instructions * (min 5 chars)</label>
            <textarea className={`${inputClass} min-h-28`} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Explain what revisions are needed..." autoFocus />
          </div>
        </div>
      </Modal>

      {/* Director Return to HR Modal */}
      <Modal
        isOpen={returnDirectorModalOpen}
        onClose={() => !saving && setReturnDirectorModalOpen(false)}
        title="Return Requisition to HR Manager"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReturnDirectorModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => handleDirectorDecision("returned")} disabled={saving || comment.trim().length < 5}>
              {saving ? "Returning..." : "Return to HR Manager"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">Send this requisition back to the HR Manager for further review.</p>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Director Notes / Concerns * (min 5 chars)</label>
            <textarea className={`${inputClass} min-h-28`} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Explain your feedback or questions..." autoFocus />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Detail({ label, value }) {
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p><div className="mt-1 text-sm text-gray-900 dark:text-white">{value || "—"}</div></div>;
}

function TextBlock({ label, html }) {
  return <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>{html ? <div className="prose prose-sm max-w-none text-gray-700 dark:prose-invert dark:text-gray-200" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} /> : <p className="text-sm text-gray-500">—</p>}</div>;
}
