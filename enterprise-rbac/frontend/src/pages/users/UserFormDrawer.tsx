import { useEffect, useState } from 'react';
import { Drawer } from '../../components/ui/Drawer';
import { TextInput, SelectInput } from '../../components/ui/FormField';
import { useSimpleList } from '../../hooks/useSimpleList';
import { extractErrorMessage } from '../../lib/api';
import type { AppUser, Role, Company, Branch, Location, Department, Team, Designation } from '../../types';

interface UserFormDrawerProps {
  open: boolean;
  onClose: () => void;
  user: AppUser | null;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}

const emptyForm = {
  fullName: '',
  username: '',
  email: '',
  phone: '',
  password: '',
  empCode: '',
  status: 'ACTIVE',
  companyId: '',
  branchId: '',
  locationId: '',
  departmentId: '',
  teamId: '',
  designationId: '',
};

export function UserFormDrawer({ open, onClose, user, onSubmit }: UserFormDrawerProps) {
  const [form, setForm] = useState(emptyForm);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: roles } = useSimpleList<Role>('/roles', open);
  const { data: companies } = useSimpleList<Company>('/organization/companies', open);
  const { data: branches } = useSimpleList<Branch>('/organization/branches', open);
  const { data: locations } = useSimpleList<Location>('/organization/locations', open);
  const { data: departments } = useSimpleList<Department>('/organization/departments', open);
  const { data: teams } = useSimpleList<Team>('/organization/teams', open);
  const { data: designations } = useSimpleList<Designation>('/organization/designations', open);

  useEffect(() => {
    if (!open) return;
    if (user) {
      setForm({
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        phone: user.phone ?? '',
        password: '',
        empCode: user.empCode ?? '',
        status: user.status,
        companyId: user.companyId ?? '',
        branchId: user.branchId ?? '',
        locationId: user.locationId ?? '',
        departmentId: user.departmentId ?? '',
        teamId: user.teamId ?? '',
        designationId: user.designationId ?? '',
      });
      setRoleIds(user.roles.map((r) => r.roleId));
    } else {
      setForm(emptyForm);
      setRoleIds([]);
    }
    setError(null);
  }, [open, user]);

  function toggleRole(roleId: string) {
    setRoleIds((prev) => (prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]));
  }

  async function handleSubmit() {
    setError(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ...form,
        roleIds,
        companyId: form.companyId || undefined,
        branchId: form.branchId || undefined,
        locationId: form.locationId || undefined,
        departmentId: form.departmentId || undefined,
        teamId: form.teamId || undefined,
        designationId: form.designationId || undefined,
      };
      if (!payload.password) delete payload.password;
      await onSubmit(payload);
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
      title={user ? 'Edit User' : 'New User'}
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

      <div className="grid grid-cols-2 gap-x-4">
        <TextInput label="Full Name" required value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
        <TextInput label="Employee Code" value={form.empCode} onChange={(e) => setForm((f) => ({ ...f, empCode: e.target.value }))} />
        <TextInput
          label="Username"
          required
          disabled={!!user}
          value={form.username}
          onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
        />
        <TextInput label="Email" type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        <TextInput label="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        <TextInput
          label={user ? 'New Password (leave blank to keep)' : 'Password'}
          type="password"
          required={!user}
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
        />
        <SelectInput label="Status" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="SUSPENDED">Suspended</option>
        </SelectInput>
        <SelectInput label="Designation" value={form.designationId} onChange={(e) => setForm((f) => ({ ...f, designationId: e.target.value }))}>
          <option value="">—</option>
          {designations?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </SelectInput>
        <SelectInput label="Company" value={form.companyId} onChange={(e) => setForm((f) => ({ ...f, companyId: e.target.value }))}>
          <option value="">—</option>
          {companies?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectInput>
        <SelectInput label="Branch" value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}>
          <option value="">—</option>
          {branches?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectInput>
        <SelectInput label="Location" value={form.locationId} onChange={(e) => setForm((f) => ({ ...f, locationId: e.target.value }))}>
          <option value="">—</option>
          {locations?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </SelectInput>
        <SelectInput label="Department" value={form.departmentId} onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}>
          <option value="">—</option>
          {departments?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </SelectInput>
        <SelectInput label="Team" value={form.teamId} onChange={(e) => setForm((f) => ({ ...f, teamId: e.target.value }))}>
          <option value="">—</option>
          {teams?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </SelectInput>
      </div>

      <div className="mt-2">
        <label className="mb-2 block text-sm font-medium text-foreground">Roles</label>
        <div className="flex flex-wrap gap-2">
          {roles?.map((role) => (
            <button
              type="button"
              key={role.id}
              onClick={() => toggleRole(role.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                roleIds.includes(role.id)
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input bg-background text-foreground hover:bg-muted'
              }`}
            >
              {role.name}
            </button>
          ))}
        </div>
      </div>
    </Drawer>
  );
}
