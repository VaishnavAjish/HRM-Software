import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthorization } from "../../../hooks/useAuthorization";

/**
 * Shared tab shell for the Organization workspace pages (Structure, Org
 * Chart, Entities, Positions, Job Architecture, Governance). Same
 * query-param-driven pattern as HiringWorkspace — `?tab=` selects the active
 * tab, unknown/unauthorized values fall back to the first visible tab.
 *
 * `tabs`: [{ key, label, permission?, render: () => ReactNode }]
 */
export default function OrgWorkspaceTabs({ tabs }) {
  const { can } = useAuthorization();
  const [searchParams, setSearchParams] = useSearchParams();

  const availableTabs = useMemo(
    () => tabs.filter((t) => !t.permission || can(t.permission)),
    [tabs, can],
  );

  const rawTab = searchParams.get("tab");
  const tab = availableTabs.some((t) => t.key === rawTab) ? rawTab : availableTabs[0]?.key;

  const selectTab = (key) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("tab", key);
      return next;
    });
  };

  const active = availableTabs.find((t) => t.key === tab);

  return (
    <div className="space-y-4">
      {availableTabs.length > 1 && (
        <div className="sticky top-0 z-30 -mx-4 md:-mx-6 px-4 md:px-6 bg-gray-50/95 dark:bg-[var(--sidebar-bg)]/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {availableTabs.map((t) => (
              <button
                key={t.key}
                onClick={() => selectTab(t.key)}
                aria-current={tab === t.key ? "page" : undefined}
                className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  tab === t.key
                    ? "border-brand-600 text-brand-600 dark:text-brand-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {active ? active.render() : (
        <p className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">
          You do not have access to any section of this workspace.
        </p>
      )}
    </div>
  );
}
