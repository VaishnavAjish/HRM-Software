import { useState, useMemo, useRef, useCallback } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);
import { SkeletonTable } from "../../../components/ui/Skeleton";
import Pagination from "../../../components/ui/Pagination";
import useGridHeaderContextMenu from "../../../hooks/useGridHeaderContextMenu";
import GridHeaderContextMenu from "../../../components/ui/GridHeaderContextMenu";
import { formatClaimNumber } from "../utils/formatters";

/**
 * Enhanced AG Grid Claims Table matching View Employees table style
 * Supports AG Grid right-click header context menu, text filter popups (Contains, Equals, Apply/Reset),
 * column sorting, and pagination.
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
}) {
  const gridRef = useRef(null);
  const gridContainerRef = useRef(null);
  const { headerMenu, headerFrozen, closeHeaderMenu, toggleHeaderFrozen } =
    useGridHeaderContextMenu(gridRef, gridContainerRef);

  const clickable = typeof onRowClick === "function";
  const [internalHiddenColumns] = useState({});

  const isColumnHidden = useCallback((key) => {
    if (hiddenColumns && typeof hiddenColumns[key] === "boolean") {
      return hiddenColumns[key];
    }
    return Boolean(internalHiddenColumns[key]);
  }, [hiddenColumns, internalHiddenColumns]);

  const visibleColumns = useMemo(() => {
    return columns.filter((col) => !isColumnHidden(col.key));
  }, [columns, isColumnHidden]);

  const defaultColDef = useMemo(
    () => ({
      sortable: true,
      filter: "agTextColumnFilter",
      resizable: true,
      suppressMovable: true,
      suppressHeaderMenuButton: true,
      suppressHeaderFilterButton: false,
      cellClass: "employee-ag-cell",
      cellStyle: { overflow: "hidden", display: "flex", alignItems: "center" },
      filterParams: {
        buttons: ["apply", "reset"],
        closeOnApply: false,
        trimInput: true,
        debounceMs: 200,
      },
    }),
    []
  );

  const columnDefs = useMemo(() => {
    return visibleColumns.map((col) => {
      const isAction = col.key === "actions";
      // A row-selection checkbox column: no sortable/filterable text value
      // to offer (unlike every data column here), and pinned to the
      // opposite side from "actions" so it reads as the row's leading
      // control rather than another data column.
      const isSelect = col.key === "select";
      const isUtility = isAction || isSelect;
      return {
        colId: col.key,
        field: col.key,
        headerName: col.label,
        sortable: !isUtility && enableSorting,
        filter: isUtility ? false : "agTextColumnFilter",
        suppressHeaderFilterButton: isUtility,
        flex: isUtility ? 0 : 1,
        minWidth: isSelect ? 60 : isAction ? 110 : 130,
        pinned: isAction ? 'right' : isSelect ? 'left' : null,
        valueGetter: (params) => {
          if (!params.data) return "";
          if (col.key === "claimNumber") return formatClaimNumber(params.data);
          if (col.key === "employeeName") return params.data.employeeName || params.data.employee_snapshot?.name || "";
          if (col.key === "patientName") return params.data.patientName || params.data.patient_snapshot?.name || "";
          if (col.key === "claimedAmount") return params.data.totalClaimedAmount ?? params.data.total_claimed_amount ?? "";
          if (col.key === "approvedAmount") return params.data.approvedAmount ?? params.data.approved_amount ?? params.data.totalApprovedAmount ?? params.data.total_approved_amount ?? "";
          if (col.key === "status") return params.data.status || "";
          return params.data[col.key] ?? "";
        },
        cellRenderer: (params) => {
          if (!params.data) return "—";
          return col.render ? col.render(params.data) : (params.data[col.key] ?? "—");
        },
      };
    });
  }, [visibleColumns, enableSorting]);

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
        <div
          ref={gridContainerRef}
          className={`employee-ag-grid w-full ${fillHeight ? "flex-1 min-h-0" : "h-[450px]"} ${
            headerFrozen ? "grid-header-frozen" : ""
          }`}
        >
          <AgGridReact
            ref={gridRef}
            rowData={rows}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            getRowId={(params) => String(getRowKey(params.data))}
            domLayout="normal"
            rowHeight={48}
            headerHeight={48}
            popupParent={document.body}
            suppressCellFocus
            enableCellTextSelection
            animateRows
            onRowClicked={(params) => {
              if (clickable && params.data) {
                onRowClick(params.data);
              }
            }}
          />
          <GridHeaderContextMenu
            menu={headerMenu}
            frozen={headerFrozen}
            onClose={closeHeaderMenu}
            onToggleFrozen={toggleHeaderFrozen}
          />
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
