import { useEffect, useMemo, useState } from 'react';
import { Drawer } from '../../components/ui/Drawer';
import { TextInput, TextareaInput } from '../../components/ui/FormField';
import { useSimpleList } from '../../hooks/useSimpleList';
import { extractErrorMessage } from '../../lib/api';
import type { Permission, Role } from '../../types';

interface RoleFormDrawerProps {
  open: boolean;
  onClose: () => void;
  role: Role | null;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}

export function RoleFormDrawer({ open, onClose, role, onSubmit }: RoleFormDrawerProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissionIds, setPermissionIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: permissions } = useSimpleList<Permission>('/permissions', open);

  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const perm of permissions ?? []) {
      const list = map.get(perm.resource) ?? [];
      list.push(perm);
      map.set(perm.resource, list);
    }
    return Array.from(map.entries());
  }, [permissions]);

  useEffect(() => {
    if (!open) return;
    if (role) {
      setName(role.name);
      setDescription(role.description ?? '');
      setPermissionIds(role.permissions.map((p) => p.permissionId));
    } else {
      setName('');
      setDescription('');
      setPermissionIds([]);
    }
    setError(null);
  }, [open, role]);

  function togglePermission(id: string) {
    setPermissionIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  function toggleResourceAll(ids: string[], allSelected: boolean) {
    setPermissionIds((prev) => (allSelected ? prev.filter((p) => !ids.includes(p)) : Array.from(new Set([...prev, ...ids]))));
  }

  async function handleSubmit() {
    setError(null);
    setSaving(true);
    try {
      await onSubmit({ name, description, permissionIds });
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={role ? 'Edit Role' : 'New Role'}
      widthClassName="max-w-2xl"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      }
    >
      {error && <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      <TextInput label="Name" required disabled={role?.isSystem} value={name} onChange={(e) => setName(e.target.value)} />
      <TextareaInput label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />

      <div className="mt-2">
        <label className="mb-2 block text-sm font-medium text-foreground">Permissions</label>
        <div className="space-y-3 rounded-md border p-3">
          {grouped.map(([resource, perms]) => {
            const ids = perms.map((p) => p.id);
            const allSelected = ids.every((id) => permissionIds.includes(id));
            return (
              <div key={resource}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{resource}</span>
                  <button
                    type="button"
                    onClick={() => toggleResourceAll(ids, allSelected)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {allSelected ? 'Clear all' : 'Select all'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {perms.map((perm) => (
                    <button
                      type="button"
                      key={perm.id}
                      onClick={() => togglePermission(perm.id)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                        permissionIds.includes(perm.id)
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background text-foreground hover:bg-muted'
                      }`}
                    >
                      {perm.action}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Drawer>
  );
}
