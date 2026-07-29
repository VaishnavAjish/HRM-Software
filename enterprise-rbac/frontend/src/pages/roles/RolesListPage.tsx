import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, ShieldAlert } from 'lucide-react';
import { DataTable } from '../../components/ui/DataTable';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Badge } from '../../components/ui/Badge';
import { RoleFormDrawer } from './RoleFormDrawer';
import { useCrudResource } from '../../hooks/useCrudResource';
import { useAuthStore } from '../../store/authStore';
import { extractErrorMessage } from '../../lib/api';
import type { Role } from '../../types';

export default function RolesListPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const navigate = useNavigate();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canCreate = hasPermission('roles', 'create');
  const canEdit = hasPermission('roles', 'edit');
  const canDelete = hasPermission('roles', 'delete');

  const { listQuery, createMutation, updateMutation, removeMutation } = useCrudResource<Role>('roles', '/roles', { page, search });

  const columns = useMemo<ColumnDef<Role, any>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <button onClick={() => navigate(`/roles/${row.original.id}`)} className="flex items-center gap-1.5 font-medium text-foreground hover:underline">
            {row.original.isSystem && <ShieldAlert className="h-3.5 w-3.5 text-primary" />}
            {row.original.name}
          </button>
        ),
      },
      { accessorKey: 'description', header: 'Description', cell: ({ getValue }) => getValue<string>() ?? '—' },
      { id: 'permissions', header: 'Permissions', cell: ({ row }) => <Badge>{row.original.permissions.length}</Badge> },
      { id: 'users', header: 'Assigned Users', cell: ({ row }) => row.original.users?.length ?? 0 },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex gap-2">
            {canEdit && (
              <button
                onClick={() => {
                  setEditingRole(row.original);
                  setDrawerOpen(true);
                }}
                className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
              >
                Edit
              </button>
            )}
            {canDelete && !row.original.isSystem && (
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
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Roles</h2>
        <p className="text-muted-foreground">Define unlimited custom roles and their permission sets.</p>
      </div>

      {deleteError && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{deleteError}</div>}

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
        toolbarActions={
          canCreate ? (
            <button
              onClick={() => {
                setEditingRole(null);
                setDrawerOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> New Role
            </button>
          ) : null
        }
      />

      <RoleFormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        role={editingRole}
        onSubmit={async (payload) => {
          if (editingRole) {
            await updateMutation.mutateAsync({ id: editingRole.id, payload });
          } else {
            await createMutation.mutateAsync(payload);
          }
        }}
      />

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Role"
        description="Users assigned to this role will lose the permissions it grants."
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) {
            removeMutation.mutate(deleteId, {
              onError: (err) => setDeleteError(extractErrorMessage(err)),
            });
          }
          setDeleteId(null);
        }}
      />
    </div>
  );
}
