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
 *
 * `fillHeight` is opt-in: when true, this card fills its flex parent's
 * height (`flex-1 min-h-0`) and the table body becomes the internally
 * scrolling region (`flex-1 overflow-auto`, sticky header) instead of the
 * card growing with row count — mirroring `EmployeeMasterTable.jsx`'s
 * full-page layout. Requires the caller to sit inside its own `flex
 * flex-col` ancestor chain with a real bounded height (see
 * `EmployeesTab.jsx`); every existing caller that omits it keeps the old
 * unrestricted-height behavior unchanged.
 *
 * `headerContent` is also opt-in: when supplied (e.g. search/filter
 * controls), it renders inside this same card, above the table, separated
 * by a border — mirroring `EmployeeMasterTable.jsx`'s single-card
 * header/body/footer layout — instead of the caller floating its own
 * filter row outside the card.
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
  fillHeight = false,
  headerContent,
}) {
  const clickable = typeof onRowClick === "function";

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 ${
        fillHeight ? "flex h-full min-h-0 flex-col" : ""
      }`}
    >
      {headerContent && (
        <div className={`border-b border-gray-100 px-4 py-3 dark:border-gray-700 sm:px-6 sm:py-4 ${fillHeight ? "shrink-0" : ""}`}>
          {headerContent}
        </div>
      )}
      {loading ? (
        <div className={`p-6 ${fillHeight ? "flex-1 min-h-0 overflow-auto" : ""}`}>
          <SkeletonTable rows={6} />
        </div>
      ) : error ? (
        <p className={`py-16 text-center text-sm text-red-500 ${fillHeight ? "flex-1 min-h-0" : ""}`}>{error}</p>
      ) : rows.length === 0 ? (
        <p className={`py-16 text-center text-sm text-gray-500 dark:text-gray-400 ${fillHeight ? "flex-1 min-h-0" : ""}`}>{emptyMessage}</p>
      ) : (
        <div className={fillHeight ? "flex-1 min-h-0 overflow-auto" : "overflow-x-auto"}>
          <table className="w-full text-sm">
            <thead
              className={`bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50 dark:text-gray-400 ${
                fillHeight ? "sticky top-0 z-10" : ""
              }`}
            >
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
        <div
          className={`${headerContent ? "border-t border-gray-100 px-4 dark:border-gray-700" : "px-4"} ${
            fillHeight ? "shrink-0" : ""
          }`}
        >
          <Pagination current={page} total={total} pageSize={perPage} onChange={onPageChange} onPageSizeChange={onPageSizeChange} />
        </div>
      )}
    </div>
  );
}
