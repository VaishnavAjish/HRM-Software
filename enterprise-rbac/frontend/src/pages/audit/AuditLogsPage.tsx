import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { DataTable } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import type { AuditLog, PaginatedResponse } from '../../types';

const ACTION_TONE: Record<string, 'success' | 'destructive' | 'warning' | 'muted'> = {
  CREATE: 'success',
  DELETE: 'destructive',
  UPDATE: 'warning',
  LOGIN: 'muted',
  LOGOUT: 'muted',
};

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: ['audit-logs', page],
    queryFn: async () => (await api.get<PaginatedResponse<AuditLog>>('/audit/logs', { params: { page, limit: 25 } })).data,
    placeholderData: (prev) => prev,
  });

  const filtered = (query.data?.data ?? []).filter(
    (log) => !search || log.resource.toLowerCase().includes(search.toLowerCase()) || log.action.toLowerCase().includes(search.toLowerCase())
  );

  const columns = useMemo<ColumnDef<AuditLog, any>[]>(
    () => [
      { id: 'action', header: 'Action', cell: ({ row }) => <Badge tone={ACTION_TONE[row.original.action] ?? 'default'}>{row.original.action}</Badge> },
      { accessorKey: 'resource', header: 'Resource' },
      { accessorKey: 'resourceId', header: 'Resource ID', cell: ({ getValue }) => <span className="font-mono text-xs">{getValue<string>()}</span> },
      { id: 'user', header: 'User', cell: ({ row }) => row.original.user?.fullName ?? 'System' },
      { accessorKey: 'ipAddress', header: 'IP Address', cell: ({ getValue }) => getValue<string>() ?? '—' },
      { id: 'timestamp', header: 'Timestamp', cell: ({ row }) => new Date(row.original.timestamp).toLocaleString() },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Audit Logs</h2>
        <p className="text-muted-foreground">Immutable record of every create, update, and delete action across the system.</p>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={query.isLoading}
        search={search}
        onSearchChange={setSearch}
        page={query.data?.meta.page ?? page}
        totalPages={query.data?.meta.totalPages ?? 1}
        onPageChange={setPage}
        emptyMessage="No audit activity yet."
      />
    </div>
  );
}
