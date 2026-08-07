import { useMemo } from "react";
import { StateBadge } from "./badges";
import EmptyState from "./EmptyState";

/**
 * The business permission codes the application's middleware still enforces,
 * shown against the canonical nodes that now own them.
 *
 * These are not a second set of switches. Each row is driven by the same
 * canonical grant as the Navigation tab — editing happens there, and this view
 * exists so an administrator migrating away from the old codes can see which
 * canonical capability replaced each one.
 */
export default function LegacyPermissionsTab({ tree }) {
  const rows = useMemo(() => {
    const byCode = new Map();

    const walk = (nodes) => {
      nodes.forEach((node) => {
        (node.impliedCodes ?? []).forEach((code) => {
          const entry = byCode.get(code) ?? { code, owners: [] };
          entry.owners.push(node);
          byCode.set(code, entry);
        });
        walk(node.children ?? []);
      });
    };

    walk(tree ?? []);

    return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [tree]);

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No legacy mappings"
        description={<p>No canonical node maps onto a legacy business permission.</p>}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-xs">
        <thead className="border-b border-gray-200 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-400">
          <tr>
            <th scope="col" className="px-4 py-2 font-semibold">Legacy Permission</th>
            <th scope="col" className="px-4 py-2 font-semibold">Canonical Capability</th>
            <th scope="col" className="px-4 py-2 font-semibold">Effective Result</th>
            <th scope="col" className="px-4 py-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
          {rows.map((row) => {
            const granting = row.owners.filter((owner) => owner.effectiveResult === "ALLOW");
            const ambiguous = row.owners.length > 1;

            return (
              <tr key={row.code} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                <td className="px-4 py-2">
                  <code className="font-mono text-[11px] text-gray-700 dark:text-gray-300">{row.code}</code>
                </td>
                <td className="px-4 py-2">
                  <ul className="space-y-0.5">
                    {row.owners.map((owner) => (
                      <li key={owner.key} className="truncate text-gray-600 dark:text-gray-400">
                        {owner.label}{" "}
                        <code className="font-mono text-[10px] text-gray-400">{owner.permissionCode}</code>
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="px-4 py-2">
                  <StateBadge state={granting.length > 0 ? "ALLOW" : "DENY"} />
                </td>
                <td className="px-4 py-2">
                  <span className={ambiguous ? "text-amber-600 dark:text-amber-400" : "text-gray-500 dark:text-gray-400"}>
                    {ambiguous ? `Mapped by ${row.owners.length} capabilities` : "Single mapping"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
