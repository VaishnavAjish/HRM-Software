import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../ui/DataTable';
import { Drawer } from '../ui/Drawer';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { TextInput, SelectInput } from '../ui/FormField';
import { useCrudResource } from '../../hooks/useCrudResource';
import { useSimpleList } from '../../hooks/useSimpleList';
import { useAuthStore } from '../../store/authStore';
import { extractErrorMessage } from '../../lib/api';

export interface FieldConfig {
  key: string;
  label: string;
  type: 'text' | 'number';
  required?: boolean;
  optionsResource?: { basePath: string; labelKey: string; valueKey?: string };
}

interface EntityCrudPageProps<T extends { id: string }> {
  resourceKey: string;
  basePath: string;
  resourcePermission: string;
  title: string;
  description: string;
  columns: ColumnDef<T, any>[];
  fields: FieldConfig[];
  emptyForm: Record<string, string>;
}

function OptionSelect({ field, value, onChange }: { field: FieldConfig; value: string; onChange: (v: string) => void }) {
  const { data } = useSimpleList<Record<string, any>>(field.optionsResource!.basePath);
  return (
    <SelectInput label={field.label} required={field.required} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select {field.label}</option>
      {(data ?? []).map((opt) => (
        <option key={opt[field.optionsResource!.valueKey ?? 'id']} value={opt[field.optionsResource!.valueKey ?? 'id']}>
          {opt[field.optionsResource!.labelKey]}
        </option>
      ))}
    </SelectInput>
  );
}

export function EntityCrudPage<T extends { id: string }>({
  resourceKey,
  basePath,
  resourcePermission,
  title,
  description,
  columns,
  fields,
  emptyForm,
}: EntityCrudPageProps<T>) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canCreate = hasPermission(resourcePermission, 'create');
  const canEdit = hasPermission(resourcePermission, 'edit');
  const canDelete = hasPermission(resourcePermission, 'delete');

  const { listQuery, createMutation, updateMutation, removeMutation, bulkRemoveMutation } = useCrudResource<T>(
    resourceKey,
    basePath,
    { page, search }
  );

  const actionsColumn: ColumnDef<T, any> = useMemo(
    () => ({
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          {canEdit && (
            <button
              onClick={() => openEdit(row.original)}
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
    }),
    [canEdit, canDelete]
  );

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEdit(record: T) {
    setEditingId(record.id);
    const next: Record<string, string> = { ...emptyForm };
    for (const field of fields) {
      const val = (record as any)[field.key];
      next[field.key] = val === null || val === undefined ? '' : String(val);
    }
    setForm(next);
    setFormError(null);
    setDrawerOpen(true);
  }

  async function handleSubmit() {
    setFormError(null);
    const payload: Record<string, unknown> = {};
    for (const field of fields) {
      payload[field.key] = field.type === 'number' ? Number(form[field.key]) : form[field.key];
    }

    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      setDrawerOpen(false);
    } catch (err) {
      setFormError(extractErrorMessage(err));
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
        <p className="text-muted-foreground">{description}</p>
      </div>

      <DataTable
        columns={[...columns, actionsColumn]}
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
              onClick={openCreate}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> New
            </button>
          ) : null
        }
      />

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editingId ? `Edit ${title.slice(0, -1)}` : `New ${title.slice(0, -1)}`}
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDrawerOpen(false)}
              className="rounded-md border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSaving}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        }
      >
        {formError && (
          <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</div>
        )}
        {fields.map((field) =>
          field.optionsResource ? (
            <OptionSelect
              key={field.key}
              field={field}
              value={form[field.key] ?? ''}
              onChange={(v) => setForm((f) => ({ ...f, [field.key]: v }))}
            />
          ) : (
            <TextInput
              key={field.key}
              label={field.label}
              type={field.type === 'number' ? 'number' : 'text'}
              required={field.required}
              value={form[field.key] ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
            />
          )
        )}
      </Drawer>

      <ConfirmDialog
        open={!!deleteId}
        title={`Delete ${title.slice(0, -1)}`}
        description="This action cannot be undone."
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
