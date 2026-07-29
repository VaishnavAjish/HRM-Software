import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { DataTable } from '../../components/ui/DataTable';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Badge } from '../../components/ui/Badge';
import { UserFormDrawer } from './UserFormDrawer';
import { useCrudResource } from '../../hooks/useCrudResource';
import { useAuthStore } from '../../store/authStore';
import type { AppUser } from '../../types';

const STATUS_TONE: Record<AppUser['status'], 'success' | 'muted' | 'destructive'> = {
  ACTIVE: 'success',
  INACTIVE: 'muted',
  SUSPENDED: 'destructive',
};

export default function UsersListPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const navigate = useNavigate();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canCreate = hasPermission('users', 'create');
  const canEdit = hasPermission('users', 'edit');
  const canDelete = hasPermission('users', 'delete');

  const { listQuery, createMutation, updateMutation, removeMutation, bulkRemoveMutation } = useCrudResource<AppUser>(
    'users',
    '/users',
    { page, search }
  );

  const columns = useMemo<ColumnDef<AppUser, any>[]>(
    () => [
      {
        accessorKey: 'fullName',
        header: 'Name',
        cell: ({ row }) => (
          <button onClick={() => navigate(`/users/${row.original.id}`)} className="text-left font-medium text-foreground hover:underline">
            {row.original.fullName}
            <div className="text-xs font-normal text-muted-foreground">{row.original.email}</div>
          </button>
        ),
      },
      {
        id: 'roles',
        header: 'Roles',
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.roles.map((r) => (
              <Badge key={r.roleId}>{r.role.name}</Badge>
            ))}
          </div>
        ),
      },
      { id: 'department', header: 'Department', cell: ({ row }) => row.original.department?.name ?? '—' },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => <Badge tone={STATUS_TONE[row.original.status]}>{row.original.status}</Badge>,
      },
      {
        id: 'lastLogin',
        header: 'Last Login',
        cell: ({ row }) => (row.original.lastLogin ? new Date(row.original.lastLogin).toLocaleString() : 'Never'),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex gap-2">
            {canEdit && (
              <button
                onClick={() => {
                  setEditingUser(row.original);
                  setDrawerOpen(true);
                }}
                className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
              >
                Edit
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => setDeleteId(row.original.id)}
                className="rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
              >
                Delete
              </button>
            )}
          </div>
        ),
      },
    ],
    [canEdit, canDelete, navigate]
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Users</h2>
        <p className="text-muted-foreground">Manage user accounts, role assignments, and organizational placement.</p>
      </div>

      <DataTable
        columns={columns}
        data={listQuery.data?.data ?? []}
        isLoading={listQuery.isLoading}
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        page={listQuery.data?.meta.page ?? page}
        totalPages={listQuery.data?.meta.totalPages ?? 1}
        onPageChange={setPage}
        enableSelection={canDelete}
        onBulkDelete={(ids) => bulkRemoveMutation.mutate(ids)}
        toolbarActions={
          canCreate ? (
            <button
              onClick={() => {
                setEditingUser(null);
                setDrawerOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> New User
            </button>
          ) : null
        }
      />

      <UserFormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        user={editingUser}
        onSubmit={async (payload) => {
          if (editingUser) {
            await updateMutation.mutateAsync({ id: editingUser.id, payload });
          } else {
            await createMutation.mutateAsync(payload);
          }
        }}
      />

      <ConfirmDialog
        open={!!deleteId}
        title="Delete User"
        description="This will permanently remove the user account. This action cannot be undone."
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) removeMutation.mutate(deleteId);
          setDeleteId(null);
        }}
      />
    </div>
  );
}
