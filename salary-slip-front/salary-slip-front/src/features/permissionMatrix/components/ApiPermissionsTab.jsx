import { StateBadge } from "./badges";
import { SENSITIVITY_META } from "../models/permissionStates";
import EmptyState from "./EmptyState";

const METHOD_TONE = {
  GET: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
  POST: "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300",
  PUT: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  PATCH: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  DELETE: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
};

export default function ApiPermissionsTab({ surface }) {
  if (!surface || surface.length === 0) {
    return (
      <EmptyState
        title="No mapped endpoints"
        description={<p>No registry node declares an API endpoint yet. Endpoints appear here as they are mapped in the canonical registry.</p>}
      />
    );
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
      {surface.map((module) => (
        <section key={module.key} className="p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{module.label}</h3>

          {module.pages.map((page) => (
            <div key={page.key} className="mt-3">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">{page.label}</p>

              <ul className="mt-1.5 space-y-1">
                {page.endpoints.map((endpoint) => (
                  <li
                    key={`${endpoint.method}-${endpoint.path}-${endpoint.permissionCode}`}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 px-3 py-1.5 text-xs dark:border-gray-700/60"
                  >
                    <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${METHOD_TONE[endpoint.method] ?? METHOD_TONE.GET}`}>
                      {endpoint.method}
                    </span>
                    <code className="font-mono text-[11px] text-gray-700 dark:text-gray-300">{endpoint.path}</code>
                    <span aria-hidden="true" className="text-gray-300 dark:text-gray-600">→</span>
                    <code className="font-mono text-[11px] text-gray-500 dark:text-gray-400">{endpoint.permissionCode}</code>

                    <span className="ml-auto flex items-center gap-2">
                      {SENSITIVITY_META[endpoint.sensitivity]?.show && (
                        <span className={`text-[10px] font-medium ${SENSITIVITY_META[endpoint.sensitivity].tone}`}>
                          {SENSITIVITY_META[endpoint.sensitivity].label}
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-medium ${endpoint.protected ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}
                        title={endpoint.protected ? "Mapped to a backend permission" : "No backend permission mapped"}
                      >
                        {endpoint.protected ? "Protected" : "Unmapped"}
                      </span>
                      <StateBadge state={endpoint.effectiveResult} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
