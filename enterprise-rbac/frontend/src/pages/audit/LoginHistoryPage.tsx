import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { DataTable } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import type { LoginHistoryEntry, PaginatedResponse } from '../../types';

const STATUS_TONE = { SUCCESS: 'success', FAILED: 'destructive', LOCKED: 'warning' } as const;

export default function LoginHistoryPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: ['login-history', page],
    queryFn: async () =>
      (await api.get<PaginatedResponse<LoginHistoryEntry>>('/audit/login-history', { params: { page, limit: 25 } })).data,
    placeholderData: (prev) => prev,
  });

  const filtered = (query.data?.data ?? []).filter(
    (entry) => !search || entry.user?.fullName.toLowerCase().includes(search.toLowerCase()) || entry.user?.username.toLowerCase().includes(search.toLowerCase())
  );

  const columns = useMemo<ColumnDef<LoginHistoryEntry, any>[]>(
    () => [
      { id: 'user', header: 'User', cell: ({ row }) => row.original.user?.fullName ?? 'Unknown' },
      { id: 'status', header: 'Status', cell: ({ row }) => <Badge tone={STATUS_TONE[row.original.status]}>{row.original.status}</Badge> },
      { accessorKey: 'ipAddress', header: 'IP Address', cell: ({ getValue }) => getValue<string>() ?? '—' },
      { accessorKey: 'userAgent', header: 'Device', cell: ({ getValue }) => <span className="max-w-xs truncate text-xs">{getValue<string>() ?? '—'}</span> },
      { id: 'timestamp', header: 'Timestamp', cell: ({ row }) => new Date(row.original.timestamp).toLocaleString() },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Login History</h2>
        <p className="text-muted-foreground">Track successful, failed, and locked login attempts.</p>
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
        emptyMessage="No login history yet."
      />
    </div>
  );
}
