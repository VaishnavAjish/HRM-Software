import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, PlayCircle, Terminal } from "lucide-react";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import UserPicker from "../../../components/authorization/UserPicker";
import permissionMatrixApi from "../services/permissionMatrixApi";

const selectClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-white";

function Field({ label, children }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </span>
      {children}
    </label>
  );
}

export default function PermissionSimulator({ tree, token, tokenType, companies }) {
  const [userId, setUserId] = useState(null);
  const [moduleKey, setModuleKey] = useState("");
  const [pageKey, setPageKey] = useState("");
  const [actionKey, setActionKey] = useState("");
  const [scope, setScope] = useState("");
  const [rawMode, setRawMode] = useState(false);
  const [rawCode, setRawCode] = useState("");
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [showTrace, setShowTrace] = useState(false);

  const modules = useMemo(() => tree ?? [], [tree]);
  const pages = useMemo(
    () => modules.find((module) => module.key === moduleKey)?.children ?? [],
    [modules, moduleKey],
  );
  const actions = useMemo(
    () => pages.find((page) => page.key === pageKey)?.children ?? [],
    [pages, pageKey],
  );

  const permissionCode = rawMode
    ? rawCode.trim()
    : (actionKey || pageKey || moduleKey);

  const run = async () => {
    if (!userId || !permissionCode) return;

    setRunning(true);
    setShowTrace(false);

    try {
      const response = await permissionMatrixApi.simulate(
        { userId: Number(userId), permissionCode, companyScope: scope || null },
        token,
        tokenType,
      );
      setResult(response?.data ?? null);
    } catch (err) {
      toast.error(err.message || "Simulation failed");
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  const tone = !result
    ? "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40"
    : result.allowed
      ? "border-green-200 bg-green-50 dark:border-green-500/30 dark:bg-green-500/10"
      : result.effectiveState === "CONDITIONAL"
        ? "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10"
        : "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10";

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
            <PlayCircle size={16} className="text-brand-500" aria-hidden="true" /> Permission Simulator
          </h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Simulate effective access for a user on a specific page or action. Runs the production engine, not a copy of it.
          </p>
        </div>

        <Button variant="secondary" size="sm" onClick={() => setRawMode((value) => !value)}>
          <Terminal size={14} className="mr-1.5" /> {rawMode ? "Guided" : "Raw code"}
        </Button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="sm:col-span-2 xl:col-span-1">
            <UserPicker value={userId} onChange={setUserId} token={token} tokenType={tokenType} label="User" />
          </div>

          {rawMode ? (
            <div className="sm:col-span-2">
              <Field label="Permission code">
                <input
                  type="text"
                  className={selectClass}
                  value={rawCode}
                  placeholder="ui.employees.master.delete"
                  onChange={(event) => setRawCode(event.target.value)}
                />
              </Field>
            </div>
          ) : (
            <>
              <Field label="Module">
                <select
                  className={selectClass}
                  value={moduleKey}
                  onChange={(event) => { setModuleKey(event.target.value); setPageKey(""); setActionKey(""); }}
                >
                  <option value="">Select…</option>
                  {modules.map((module) => (
                    <option key={module.key} value={module.key}>{module.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Page">
                <select
                  className={selectClass}
                  value={pageKey}
                  disabled={pages.length === 0}
                  onChange={(event) => { setPageKey(event.target.value); setActionKey(""); }}
                >
                  <option value="">Whole module</option>
                  {pages.map((page) => (
                    <option key={page.key} value={page.key}>{page.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Action">
                <select
                  className={selectClass}
                  value={actionKey}
                  disabled={actions.length === 0}
                  onChange={(event) => setActionKey(event.target.value)}
                >
                  <option value="">Whole page</option>
                  {actions.filter((action) => action.assignable).map((action) => (
                    <option key={action.key} value={action.key}>{action.label}</option>
                  ))}
                </select>
              </Field>
            </>
          )}

          <Field label="Company Scope">
            <select className={selectClass} value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value="">Both Companies</option>
              {(companies ?? []).map((company) => (
                <option key={company.id} value={company.id}>{company.label}</option>
              ))}
            </select>
          </Field>

          <div className="flex items-end">
            <Button onClick={run} disabled={running || !userId || !permissionCode}>
              {running
                ? <Loader2 size={15} className="mr-1.5 animate-spin" />
                : <PlayCircle size={15} className="mr-1.5" />}
              Simulate
            </Button>
          </div>
        </div>

        <div className={`rounded-xl border p-4 ${tone}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Result</p>

          {!result ? (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Pick a user and a capability, then run the simulation.
            </p>
          ) : (
            <>
              <p className={`mt-1 text-xl font-bold ${result.allowed ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
                {result.allowed ? "Allowed" : "Denied"}
              </p>
              <p className="mt-1 text-xs text-gray-700 dark:text-gray-300">{result.explanation?.reason}</p>

              <button
                type="button"
                className="mt-3 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                onClick={() => setShowTrace((value) => !value)}
              >
                {showTrace ? "Hide explanation" : "View Explanation →"}
              </button>

              {showTrace && (
                <dl className="mt-3 space-y-1 border-t border-black/5 pt-3 dark:border-white/10">
                  {(result.explanation?.steps ?? []).map((step) => (
                    <div key={step.label} className="flex gap-2 text-[11px]">
                      <dt className="w-32 shrink-0 text-gray-500 dark:text-gray-400">{step.label}</dt>
                      <dd className="min-w-0 flex-1 break-words text-gray-800 dark:text-gray-200">{step.value}</dd>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1 text-[11px] font-semibold">
                    <dt className="w-32 shrink-0 text-gray-500 dark:text-gray-400">Final decision</dt>
                    <dd className={result.allowed ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}>
                      {result.explanation?.finalDecision}
                    </dd>
                  </div>
                  <p className="pt-1 text-[10px] text-gray-500 dark:text-gray-400">
                    Evaluated in {result.evaluationTimeMs} ms · simulation is not written to the decision log.
                  </p>
                </dl>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
