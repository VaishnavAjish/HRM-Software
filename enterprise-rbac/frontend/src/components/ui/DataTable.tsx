import { useState, type ReactNode } from 'react';
import {
  type ColumnDef,
  type RowSelectionState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Search, Trash2 } from 'lucide-react';
import clsx from 'clsx';

interface DataTableProps<T> {
  columns: ColumnDef<T, any>[];
  data: T[];
  isLoading?: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  toolbarActions?: ReactNode;
  enableSelection?: boolean;
  onBulkDelete?: (ids: string[]) => void;
  getRowId?: (row: T) => string;
  emptyMessage?: string;
}

export function DataTable<T extends { id?: string }>({
  columns,
  data,
  isLoading,
  search,
  onSearchChange,
  page,
  totalPages,
  onPageChange,
  toolbarActions,
  enableSelection,
  onBulkDelete,
  getRowId,
  emptyMessage = 'No records found.',
}: DataTableProps<T>) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const selectionColumn: ColumnDef<T, any> | null = enableSelection
    ? {
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
            className="h-4 w-4 rounded border-input"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            className="h-4 w-4 rounded border-input"
          />
        ),
      }
    : null;

  const table = useReactTable({
    data,
    columns: selectionColumn ? [selectionColumn, ...columns] : columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    enableRowSelection: enableSelection,
  });

  const selectedIds = Object.keys(rowSelection);

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search..."
            className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex items-center gap-2">
          {enableSelection && selectedIds.length > 0 && onBulkDelete && (
            <button
              onClick={() => {
                onBulkDelete(selectedIds);
                setRowSelection({});
              }}
              className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/20"
            >
              <Trash2 className="h-4 w-4" /> Delete ({selectedIds.length})
            </button>
          )}
          {toolbarActions}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="whitespace-nowrap px-4 py-3 font-medium">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={columns.length + (selectionColumn ? 1 : 0)} className="px-4 py-3">
                    <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  </td>
                </tr>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectionColumn ? 1 : 0)} className="px-4 py-10 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="whitespace-nowrap px-4 py-3 text-foreground">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
        <span>
          Page {page} of {totalPages}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className={clsx('rounded-md p-1.5 hover:bg-muted', page <= 1 && 'cursor-not-allowed opacity-40')}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className={clsx('rounded-md p-1.5 hover:bg-muted', page >= totalPages && 'cursor-not-allowed opacity-40')}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
