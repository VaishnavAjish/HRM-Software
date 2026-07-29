import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { DataTable } from '../../components/ui/DataTable';
import { Drawer } from '../../components/ui/Drawer';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { TextInput, TextareaInput, SelectInput } from '../../components/ui/FormField';
import { Badge } from '../../components/ui/Badge';
import { useCrudResource } from '../../hooks/useCrudResource';
import { useSimpleList } from '../../hooks/useSimpleList';
import { useAuthStore } from '../../store/authStore';
import { extractErrorMessage } from '../../lib/api';
import type { Permission, PermissionGroup } from '../../types';

const RESOURCE_PERMISSION = 'permission_groups';

export default function PermissionGroupsPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManageGroups = hasPermission(RESOURCE_PERMISSION, 'create') || hasPermission(RESOURCE_PERMISSION, 'edit');
  const canManagePermissions = hasPermission('permissions', 'create') || hasPermission('permissions', 'edit');

  const [groupPage, setGroupPage] = useState(1);
  const [groupSearch, setGroupSearch] = useState('');
  const [groupDrawerOpen, setGroupDrawerOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<PermissionGroup | null>(null);
  const [groupForm, setGroupForm] = useState({ name: '', description: '' });
  const [groupError, setGroupError] = useState<string | null>(null);
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);

  const [permPage, setPermPage] = useState(1);
  const [permSearch, setPermSearch] = useState('');
  const [permDrawerOpen, setPermDrawerOpen] = useState(false);
  const [editingPerm, setEditingPerm] = useState<Permission | null>(null);
  const [permForm, setPermForm] = useState({ name: '', resource: '', action: '', description: '', groupId: '' });
  const [permError, setPermError] = useState<string | null>(null);
  const [deletePermId, setDeletePermId] = useState<string | null>(null);

  const groups = useCrudResource<PermissionGroup>('permission-groups', '/permissions/groups', { page: groupPage, search: groupSearch });
  const perms = useCrudResource<Permission>('permissions', '/permissions', { page: permPage, search: permSearch });
  const { data: groupOptions } = useSimpleList<PermissionGroup>('/permissions/groups', permDrawerOpen);

  const groupColumns = useMemo<ColumnDef<PermissionGroup, any>[]>(
    () => [
      { accessorKey: 'name', header: 'Group Name' },
      { accessorKey: 'description', header: 'Description', cell: ({ getValue }) => getValue<string>() ?? '—' },
      { id: 'count', header: 'Permissions', cell: ({ row }) => <Badge>{row.original.permissions?.length ?? 0}</Badge> },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) =>
          canManageGroups ? (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setEditingGroup(row.original);
                  setGroupForm({ name: row.original.name, description: row.original.description ?? '' });
                  setGroupDrawerOpen(true);
                }}
                className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
              >
                Edit
              </button>
              <button
                onClick={() => setDeleteGroupId(row.original.id)}
                className="rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
              >
                Delete
              </button>
            </div>
          ) : null,
      },
    ],
    [canManageGroups]
  );

  const permColumns = useMemo<ColumnDef<Permission, any>[]>(
    () => [
      { accessorKey: 'name', header: 'Permission' },
      { accessorKey: 'resource', header: 'Resource' },
      { accessorKey: 'action', header: 'Action' },
      { id: 'group', header: 'Group', cell: ({ row }) => row.original.group?.name ?? '—' },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) =>
          canManagePermissions ? (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setEditingPerm(row.original);
                  setPermForm({
                    name: row.original.name,
                    resource: row.original.resource,
                    action: row.original.action,
                    description: row.original.description ?? '',
                    groupId: row.original.groupId ?? '',
                  });
                  setPermDrawerOpen(true);
                }}
                className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
              >
                Edit
              </button>
              <button
                onClick={() => setDeletePermId(row.original.id)}
                className="rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
              >
                Delete
              </button>
            </div>
          ) : null,
      },
    ],
    [canManagePermissions]
  );

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Permission Groups</h2>
        <p className="text-muted-foreground">Organize granular permissions into logical groups for easier role assignment.</p>
      </div>

      <DataTable
        columns={groupColumns}
        data={groups.listQuery.data?.data ?? []}
        isLoading={groups.listQuery.isLoading}
        search={groupSearch}
        onSearchChange={(v) => {
          setGroupSearch(v);
          setGroupPage(1);
        }}
        page={groups.listQuery.data?.meta.page ?? groupPage}
        totalPages={groups.listQuery.data?.meta.totalPages ?? 1}
        onPageChange={setGroupPage}
        toolbarActions={
          canManageGroups ? (
            <button
              onClick={() => {
                setEditingGroup(null);
                setGroupForm({ name: '', description: '' });
                setGroupDrawerOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> New Group
            </button>
          ) : null
        }
      />

      <div>
        <h3 className="mb-4 text-lg font-semibold text-foreground">All Permissions</h3>
        <DataTable
          columns={permColumns}
          data={perms.listQuery.data?.data ?? []}
          isLoading={perms.listQuery.isLoading}
          search={permSearch}
          onSearchChange={(v) => {
            setPermSearch(v);
            setPermPage(1);
          }}
          page={perms.listQuery.data?.meta.page ?? permPage}
          totalPages={perms.listQuery.data?.meta.totalPages ?? 1}
          onPageChange={setPermPage}
          toolbarActions={
            canManagePermissions ? (
              <button
                onClick={() => {
                  setEditingPerm(null);
                  setPermForm({ name: '', resource: '', action: '', description: '', groupId: '' });
                  setPermDrawerOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> New Permission
              </button>
            ) : null
          }
        />
      </div>

      <Drawer
        open={groupDrawerOpen}
        onClose={() => setGroupDrawerOpen(false)}
        title={editingGroup ? 'Edit Group' : 'New Group'}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setGroupDrawerOpen(false)} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
              Cancel
            </button>
            <button
              onClick={async () => {
                setGroupError(null);
                try {
                  if (editingGroup) {
                    await groups.updateMutation.mutateAsync({ id: editingGroup.id, payload: groupForm });
                  } else {
                    await groups.createMutation.mutateAsync(groupForm);
                  }
                  setGroupDrawerOpen(false);
                } catch (err) {
                  setGroupError(extractErrorMessage(err));
                }
              }}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Save
            </button>
          </div>
        }
      >
        {groupError && <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{groupError}</div>}
        <TextInput label="Name" required value={groupForm.name} onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))} />
        <TextareaInput
          label="Description"
          value={groupForm.description}
          onChange={(e) => setGroupForm((f) => ({ ...f, description: e.target.value }))}
        />
      </Drawer>

      <Drawer
        open={permDrawerOpen}
        onClose={() => setPermDrawerOpen(false)}
        title={editingPerm ? 'Edit Permission' : 'New Permission'}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setPermDrawerOpen(false)} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
              Cancel
            </button>
            <button
              onClick={async () => {
                setPermError(null);
                try {
                  const payload = { ...permForm, groupId: permForm.groupId || undefined };
                  if (editingPerm) {
                    await perms.updateMutation.mutateAsync({ id: editingPerm.id, payload });
                  } else {
                    await perms.createMutation.mutateAsync(payload);
                  }
                  setPermDrawerOpen(false);
                } catch (err) {
                  setPermError(extractErrorMessage(err));
                }
              }}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Save
            </button>
          </div>
        }
      >
        {permError && <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{permError}</div>}
        <TextInput label="Name (e.g. users.read)" required value={permForm.name} onChange={(e) => setPermForm((f) => ({ ...f, name: e.target.value }))} />
        <TextInput label="Resource (e.g. users)" required value={permForm.resource} onChange={(e) => setPermForm((f) => ({ ...f, resource: e.target.value }))} />
        <TextInput label="Action (e.g. read)" required value={permForm.action} onChange={(e) => setPermForm((f) => ({ ...f, action: e.target.value }))} />
        <TextareaInput label="Description" value={permForm.description} onChange={(e) => setPermForm((f) => ({ ...f, description: e.target.value }))} />
        <SelectInput label="Group" value={permForm.groupId} onChange={(e) => setPermForm((f) => ({ ...f, groupId: e.target.value }))}>
          <option value="">—</option>
          {groupOptions?.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </SelectInput>
      </Drawer>

      <ConfirmDialog
        open={!!deleteGroupId}
        title="Delete Permission Group"
        description="Permissions in this group will be ungrouped, not deleted."
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteGroupId(null)}
        onConfirm={() => {
          if (deleteGroupId) groups.removeMutation.mutate(deleteGroupId);
          setDeleteGroupId(null);
        }}
      />

      <ConfirmDialog
        open={!!deletePermId}
        title="Delete Permission"
        description="Roles and user overrides referencing this permission will lose it."
        confirmLabel="Delete"
        danger
        onCancel={() => setDeletePermId(null)}
        onConfirm={() => {
          if (deletePermId) perms.removeMutation.mutate(deletePermId);
          setDeletePermId(null);
        }}
      />
    </div>
  );
}
