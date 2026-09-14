import { SkeletonTable } from "../../../components/ui/Skeleton";
import Pagination from "../../../components/ui/Pagination";

/**
 * Shared, reasonably generic paginated claims table — columns configurable
 * via a `columns` prop (`{ key, label, render(row), className?,
 * headerClassName? }`) so Team Claims, Pending Reviews, History (this
 * phase), and the admin Claims tab (later phases) all reuse this one
 * implementation instead of each hand-rolling their own `<table>`.
 *
 * Deliberately a plain HTML table, not ag-grid-react: every list screen
 * actually built *recently* in this app (`RequisitionsTab.jsx`,
 * `AssetAllocation.jsx`, the other hiring tabs) uses this exact pattern —
 * `<table>` + `SkeletonTable` + `Pagination` — even though ag-grid-react is
 * a dependency a few *older* pages use (`EmployeeManagement.jsx`,
 * `SalaryManagement.jsx`, `Appointments.jsx`). Matching the house style of
 * the screens this app is currently being built with outweighs reaching
 * for ag-grid just because it happens to be installed.
 */
export default function ClaimsTable({
  columns,
  rows = [],
  loading = false,
  error = null,
  emptyMessage = "No claims found.",
  getRowKey = (row) => row.id ?? row.claimId,
  onRowClick,
  page,
  perPage,
  total,
  onPageChange,
  onPageSizeChange,
}) {
  const clickable = typeof onRowClick === "function";

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      {loading ? (
        <div className="p-6">
          <SkeletonTable rows={6} />
        </div>
      ) : error ? (
        <p className="py-16 text-center text-sm text-red-500">{error}</p>
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50 dark:text-gray-400">
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className={`px-4 py-3 text-left ${col.headerClassName || ""}`}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {rows.map((row) => (
                <tr
                  key={getRowKey(row)}
                  onClick={clickable ? () => onRowClick(row) : undefined}
                  className={clickable ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30" : ""}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3 text-gray-600 dark:text-gray-300 ${col.className || ""}`}>
                      {col.render ? col.render(row) : (row[col.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {typeof onPageChange === "function" && (
        <div className="px-4">
          <Pagination current={page} total={total} pageSize={perPage} onChange={onPageChange} onPageSizeChange={onPageSizeChange} />
        </div>
      )}
    </div>
  );
}
