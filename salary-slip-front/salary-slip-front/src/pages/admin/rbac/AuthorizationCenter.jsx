import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, RefreshCw, Play, AlertTriangle } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { authorizationApi } from "../../../utils/api";

const titles = {
  overview: ["Authorization Overview", "Effective roles, scopes and rollout status"],
  roles: ["Enterprise Roles", "System, business and custom roles with scoped assignments"],
  policies: ["Policy Management", "Versioned ABAC/PBAC policies and deployment state"],
  requests: ["Access Requests", "Approval queue for time-bound scoped access"],
  audit: ["Decision Audit", "Allow and deny decisions with policy and scope evidence"],
  simulator: ["Access Simulator", "Explain an authorization result before rollout"],
};

export default function AuthorizationCenter({ view = "overview" }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subjectId, setSubjectId] = useState(user?.id || "");
  const [permissionCode, setPermissionCode] = useState("hr.employee.read");
  const [simulation, setSimulation] = useState(null);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = view === "policies"
        ? await authorizationApi.policies(user.accessToken, user.tokenType)
        : view === "requests"
          ? await authorizationApi.accessRequests(user.accessToken, user.tokenType)
          : view === "roles"
            ? await authorizationApi.roles(user.accessToken, user.tokenType)
            : view === "audit"
              ? await authorizationApi.audit(user.accessToken, user.tokenType)
          : await authorizationApi.me(user.accessToken, user.tokenType);
      setData(response?.data ?? response);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (view === "simulator") return undefined;
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => data?.data ?? (Array.isArray(data) ? data : []), [data]);

  const runSimulation = async (event) => {
    event.preventDefault(); setError(""); setSimulation(null);
    try {
      const response = await authorizationApi.simulate({
        subjectId: Number(subjectId), permissionCode,
        resource: { company_code: user.company_code, resource_type: permissionCode.split(".").slice(0, -1).join(".") },
      }, user.accessToken, user.tokenType);
      setSimulation(response?.data?.decision ?? response?.data);
    } catch (e) { setError(e.message); }
  };

  const mutate = async (operation) => {
    setError("");
    try { await operation(); await load(); } catch (e) { setError(e.message); }
  };

  return <div className="space-y-6 p-4 sm:p-6">
    <div className="flex items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-gray-900 dark:text-white">{titles[view][0]}</h1><p className="mt-1 text-sm text-gray-500">{titles[view][1]}</p></div>
      {view !== "simulator" && <button onClick={load} className="rounded-lg border p-2 text-gray-600" aria-label="Refresh"><RefreshCw size={18} /></button>}
    </div>
    {error && <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertTriangle size={18}/>{error}</div>}
    {view === "overview" && !loading && <div className="grid gap-4 md:grid-cols-3">
      <Metric label="Effective roles" value={data?.roles?.length ?? 0} />
      <Metric label="Allowed permissions" value={Object.values(data?.permissions ?? {}).filter((x) => x.allowed).length} />
      <Metric label="Engine version" value={data?.authorizationVersion ?? "v2"} />
      <section className="md:col-span-3 rounded-2xl border bg-white p-5 dark:border-gray-700 dark:bg-gray-800"><h2 className="font-semibold">Feature rollout</h2><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(data?.featureFlags ?? {}).map(([key, enabled]) => <div key={key} className="flex justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-900"><span>{key.replaceAll("_", " ")}</span><span className={enabled ? "text-green-600" : "text-gray-400"}>{enabled ? "Enabled" : "Disabled"}</span></div>)}</div></section>
    </div>}
    {(["roles", "policies", "requests", "audit"].includes(view)) && <section className="overflow-hidden rounded-2xl border bg-white dark:border-gray-700 dark:bg-gray-800">{loading ? <p className="p-6 text-sm text-gray-500">Loading…</p> : rows.length === 0 ? <p className="p-6 text-sm text-gray-500">No records found.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50 dark:bg-gray-900"><tr><th className="px-4 py-3">Name / Action</th><th className="px-4 py-3">Scope / Resource</th><th className="px-4 py-3">Status / Decision</th><th className="px-4 py-3">Version / Duration</th><th className="px-4 py-3">Actions</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t dark:border-gray-700"><td className="px-4 py-3 font-medium">{row.name || row.action || row.permission_code || row.role?.name || `Request #${row.id}`}</td><td className="px-4 py-3">{row.scope_type || row.resource_type || row.default_scope_type || "—"}{row.scope_id ? `: ${row.scope_id}` : ""}</td><td className="px-4 py-3">{row.status || row.decision || (row.is_active ? "ACTIVE" : "DISABLED")}</td><td className="px-4 py-3">{row.version || (row.duration_ms != null ? `${row.duration_ms} ms` : null) || row.requested_until || "—"}</td><td className="px-4 py-3"><div className="flex gap-2">{view === "policies" && row.status === "DRAFT" && <button onClick={() => mutate(() => authorizationApi.publishPolicy(row.id, user.accessToken, user.tokenType))} className="rounded bg-brand-600 px-2 py-1 text-xs font-semibold text-white">Publish</button>}{view === "requests" && row.status === "PENDING" && <><button onClick={() => mutate(() => authorizationApi.decideAccessRequest(row.id, "approve", user.accessToken, user.tokenType))} className="rounded bg-green-600 px-2 py-1 text-xs font-semibold text-white">Approve</button><button onClick={() => mutate(() => authorizationApi.decideAccessRequest(row.id, "reject", user.accessToken, user.tokenType))} className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white">Reject</button></>}</div></td></tr>)}</tbody></table></div>}</section>}
    {view === "simulator" && <div className="grid gap-5 lg:grid-cols-2"><form onSubmit={runSimulation} className="space-y-4 rounded-2xl border bg-white p-5 dark:border-gray-700 dark:bg-gray-800"><label className="block text-sm font-medium">Subject user ID<input value={subjectId} onChange={(e)=>setSubjectId(e.target.value)} required type="number" className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2" /></label><label className="block text-sm font-medium">Permission code<input value={permissionCode} onChange={(e)=>setPermissionCode(e.target.value)} required className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2 font-mono" /></label><button className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"><Play size={16}/>Simulate</button></form><section className="rounded-2xl border bg-white p-5 dark:border-gray-700 dark:bg-gray-800"><h2 className="flex items-center gap-2 font-semibold"><ShieldCheck size={18}/>Decision explanation</h2>{simulation ? <pre className="mt-4 max-h-96 overflow-auto rounded-xl bg-gray-950 p-4 text-xs text-green-300">{JSON.stringify(simulation, null, 2)}</pre> : <p className="mt-4 text-sm text-gray-500">Run a simulation to see matched sources, policies, conditions and obligations.</p>}</section></div>}
  </div>;
}

function Metric({ label, value }) { return <div className="rounded-2xl border bg-white p-5 dark:border-gray-700 dark:bg-gray-800"><p className="text-sm text-gray-500">{label}</p><p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p></div>; }
