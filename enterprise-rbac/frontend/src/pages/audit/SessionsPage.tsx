import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { DataTable } from '../../components/ui/DataTable';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useAuthStore } from '../../store/authStore';
import type { PaginatedResponse, SessionEntry } from '../../types';

export default function SessionsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const canDelete = useAuthStore((s) => s.hasPermission('sessions', 'delete'));

  const query = useQuery({
    queryKey: ['sessions', page],
    queryFn: async () => (await api.get<PaginatedResponse<SessionEntry>>('/audit/sessions', { params: { page, limit: 25 } })).data,
    placeholderData: (prev) => prev,
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/audit/sessions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });

  const filtered = (query.data?.data ?? []).filter(
    (s) => !search || s.user?.fullName.toLowerCase().includes(search.toLowerCase())
  );

  const columns = useMemo<ColumnDef<SessionEntry, any>[]>(
    () => [
      { id: 'user', header: 'User', cell: ({ row }) => row.original.user?.fullName ?? 'Unknown' },
      { accessorKey: 'ipAddress', header: 'IP Address', cell: ({ getValue }) => getValue<string>() ?? '—' },
      { accessorKey: 'userAgent', header: 'Device', cell: ({ getValue }) => <span className="max-w-xs truncate text-xs">{getValue<string>() ?? '—'}</span> },
      { id: 'createdAt', header: 'Started', cell: ({ row }) => new Date(row.original.createdAt).toLocaleString() },
      { id: 'expiresAt', header: 'Expires', cell: ({ row }) => new Date(row.original.expiresAt).toLocaleString() },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) =>
          canDelete ? (
            <button
              onClick={() => setRevokeId(row.original.id)}
              className="rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
            >
              Revoke
            </button>
          ) : null,
      },
    ],
    [canDelete]
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Login Sessions</h2>
        <p className="text-muted-foreground">Active sessions across all devices. Revoke to force logout.</p>
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
        emptyMessage="No active sessions."
      />

      <ConfirmDialog
        open={!!revokeId}
        title="Revoke Session"
        description="The user will be signed out on that device and must log in again."
        confirmLabel="Revoke"
        danger
        onCancel={() => setRevokeId(null)}
        onConfirm={() => {
          if (revokeId) revokeMutation.mutate(revokeId);
          setRevokeId(null);
        }}
      />
    </div>
  );
}
