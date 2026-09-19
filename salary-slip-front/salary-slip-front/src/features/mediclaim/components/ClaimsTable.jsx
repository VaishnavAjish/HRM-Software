import { useState, useMemo } from "react";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import Pagination from "../../../components/ui/Pagination";
import { Columns, ArrowUpDown, ArrowUp, ArrowDown, Check } from "lucide-react";

/**
 * Enhanced Paginated Claims Table matching View Employees table style
 * Supports column sorting, column visibility toggle, sticky headers, and pagination.
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
  enableSorting = true,
  hiddenColumns = {},
  onToggleColumn,
}) {
  const clickable = typeof onRowClick === "function";
  const [internalHiddenColumns, setInternalHiddenColumns] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });

  const isColumnHidden = (key) => {
    if (hiddenColumns && typeof hiddenColumns[key] === "boolean") {
      return hiddenColumns[key];
    }
    return Boolean(internalHiddenColumns[key]);
  };

  const visibleColumns = useMemo(() => {
    return columns.filter((col) => !isColumnHidden(col.key));
  }, [columns, hiddenColumns, internalHiddenColumns]);

  const handleSort = (key) => {
    if (!enableSorting || key === "actions") return;
    setSortConfig((prev) => {
      if (prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return { key: null, direction: "asc" };
    });
  };

  const sortedRows = useMemo(() => {
    if (!sortConfig.key || !Array.isArray(rows)) return rows;

    return [...rows].sort((a, b) => {
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];

      if (valA == null) return 1;
      if (valB == null) return -1;

      if (typeof valA === "number" && typeof valB === "number") {
        return sortConfig.direction === "asc" ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      if (strA < strB) return sortConfig.direction === "asc" ? -1 : 1;
      if (strA > strB) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, sortConfig]);

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
      ) : sortedRows.length === 0 ? (
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
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`px-4 py-3 text-left font-semibold tracking-wider transition select-none ${
                      enableSorting && col.key !== "actions" ? "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600/50" : ""
                    } ${col.headerClassName || ""}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{col.label}</span>
                      {enableSorting && col.key !== "actions" && (
                        <span className="text-gray-400">
                          {sortConfig.key === col.key ? (
                            sortConfig.direction === "asc" ? (
                              <ArrowUp size={12} className="text-brand-600 dark:text-brand-400" />
                            ) : (
                              <ArrowDown size={12} className="text-brand-600 dark:text-brand-400" />
                            )
                          ) : (
                            <ArrowUpDown size={12} className="opacity-40 hover:opacity-100" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {sortedRows.map((row) => (
                <tr
                  key={getRowKey(row)}
                  onClick={clickable ? () => onRowClick(row) : undefined}
                  className={clickable ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30" : ""}
                >
                  {visibleColumns.map((col) => (
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
