import { useEffect, useState } from "react";
import { Globe, ExternalLink, Copy, Search, Lock } from "lucide-react";
import toast from "react-hot-toast";
import Badge from "../../../../components/ui/Badge";
import Button from "../../../../components/ui/Button";
import Pagination from "../../../../components/ui/Pagination";
import { SkeletonTable } from "../../../../components/ui/Skeleton";
import { useAuth } from "../../../../context/AuthContext";
import { useCompany } from "../../../../context/CompanyContext";
import { useAuthorization } from "../../../../hooks/useAuthorization";
import { hrApi } from "../../../../utils/api";

const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const STATUS_TABS = [
  { key: "approved", label: "Ready to Publish" },
  { key: "published", label: "Published" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All Requisitions" },
];

export default function JobPortalTab({ departments = [] }) {
  const { user } = useAuth();
  const { companyScope, scopeKey } = useCompany();
  const { can } = useAuthorization();
  const canPublish = can("ui.hr.hiring.job_portal.publish") || can("ui.hr.hiring.requisition_publish");

  const [status, setStatus] = useState("approved");
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({ approved: 0, published: 0, closed: 0 });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  const load = () => {
    if (!user?.accessToken) return;
    setLoading(true);
    hrApi.getJobPortalQueue(user.accessToken, user.tokenType, {
      company_code: companyScope?.companyId,
      unit: companyScope?.unit,
      status,
      search: search.trim() || undefined,
      department_id: departmentId || undefined,
      page,
      per_page: perPage,
    })
      .then((res) => {
        if (res.status) {
          const payload = res.data || {};
          setRows(payload.data || []);
          setTotal(payload.total || 0);
          setCounts(res.counts || { approved: 0, published: 0, closed: 0 });
        }
      })
      .catch((err) => toast.error(err.message || "Failed to load Job Portal queue"))
      .finally(() => setLoading(false));
  };

  useEffect(load, [user, scopeKey, status, departmentId, page, perPage]);

  const handlePublish = async (id) => {
    if (!canPublish) {
      toast.error("You do not have permission to publish jobs.");
      return;
    }
    setActionLoading(id);
    try {
      const res = await hrApi.publishPortal(id, user.accessToken, user.tokenType);
      if (res.status) {
        toast.success("Job listing published to Public Careers Portal!");
        load();
      }
    } catch (err) {
      toast.error(err.message || "Failed to publish job listing");
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnpublish = async (id) => {
    if (!canPublish) {
      toast.error("You do not have permission to unpublish jobs.");
      return;
    }
    setActionLoading(id);
    try {
      const res = await hrApi.unpublishPortal(id, user.accessToken, user.tokenType);
      if (res.status) {
        toast.success("Job listing unpublished.");
        load();
      }
    } catch (err) {
      toast.error(err.message || "Failed to unpublish job listing");
    } finally {
      setActionLoading(null);
    }
  };

  const handleClose = async (id) => {
    if (!window.confirm("Close this job listing? Applicants will no longer be able to submit applications.")) return;
    setActionLoading(id);
    try {
      const res = await hrApi.closeRequisition(id, user.accessToken, user.tokenType);
      if (res.status) {
        toast.success("Job listing closed.");
        load();
      }
    } catch (err) {
      toast.error(err.message || "Failed to close job listing");
    } finally {
      setActionLoading(null);
    }
  };

  const copyPublicLink = (id) => {
    const url = `${window.location.origin}/careers/jobs/${id}`;
    navigator.clipboard.writeText(url);
    toast.success("Public job link copied to clipboard!");
  };

  return (
    <div className="space-y-4">
      {/* Top Header Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-brand-600 to-indigo-700 p-6 text-white shadow-md">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Globe className="h-6 w-6 text-brand-200" />
              <h2 className="text-xl font-bold">Public Job Portal Queue</h2>
            </div>
            <p className="mt-1 text-sm text-brand-100">
              Manage live job postings on your external Careers Portal for public candidates.
            </p>
          </div>
          <a
            href="/careers"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur-sm hover:bg-white/20 transition-colors"
          >
            <ExternalLink size={16} /> Preview Careers Site
          </a>
        </div>
      </div>

      {/* Tab Filter Pills */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => { setStatus(tab.key); setPage(1); }}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                status === tab.key
                  ? "bg-brand-600 text-white"
                  : "text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
              }`}
            >
              {tab.label}
              {counts[tab.key] !== undefined && (
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                  status === tab.key ? "bg-white/20 text-white" : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                }`}>
                  {counts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Filter inputs */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={`${inputClass} !w-44 text-xs`}
            value={departmentId}
            onChange={(e) => { setDepartmentId(e.target.value); setPage(1); }}
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <div className="relative w-56">
            <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              className={`${inputClass} pl-8 text-xs`}
              placeholder="Search title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
            />
          </div>
        </div>
      </div>

      {/* Main Data Table */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 shadow-xs">
        {loading ? (
          <div className="p-4"><SkeletonTable rows={5} cols={7} /></div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500 dark:text-gray-400">
            No job listings found in the {status.replace("_", " ")} queue.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3">Job Title</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Openings</th>
                  <th className="px-4 py-3">Applicants</th>
                  <th className="px-4 py-3">Posted Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {rows.map((req) => (
                  <tr key={req.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900 dark:text-white">{req.title}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{req.employment_type?.replace("_", " ")} · {req.designation}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{req.department?.name || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{req.openings}</td>
                    <td className="px-4 py-3 font-semibold text-brand-600 dark:text-brand-400">
                      {req.candidates_count || 0}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {req.posted_at ? new Date(req.posted_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={req.status === "published" ? "green" : req.status === "approved" ? "blue" : "gray"}>
                        {req.status === "published" ? "Live on Portal" : req.status === "approved" ? "Approved" : req.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {req.status === "approved" && (
                          <Button
                            size="sm"
                            onClick={() => handlePublish(req.id)}
                            disabled={actionLoading === req.id || !canPublish}
                          >
                            <Globe size={14} className="mr-1" />
                            {actionLoading === req.id ? "Publishing..." : "Publish Job"}
                          </Button>
                        )}

                        {req.status === "published" && (
                          <>
                            <button
                              type="button"
                              onClick={() => copyPublicLink(req.id)}
                              title="Copy Public Link"
                              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              <Copy size={15} />
                            </button>
                            <a
                              href={`/careers/jobs/${req.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="View Public Page"
                              className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-900/20"
                            >
                              <ExternalLink size={15} />
                            </a>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleUnpublish(req.id)}
                              disabled={actionLoading === req.id || !canPublish}
                            >
                              Unpublish
                            </Button>
                          </>
                        )}

                        {req.status !== "closed" && (
                          <button
                            type="button"
                            onClick={() => handleClose(req.id)}
                            title="Close Listing"
                            disabled={actionLoading === req.id}
                            className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <Lock size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4">
          <Pagination current={page} total={total} pageSize={perPage} onChange={setPage} onPageSizeChange={(v) => { setPerPage(v); setPage(1); }} />
        </div>
      </div>
    </div>
  );
}
