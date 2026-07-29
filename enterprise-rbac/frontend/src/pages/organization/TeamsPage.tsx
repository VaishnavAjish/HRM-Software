import type { ColumnDef } from '@tanstack/react-table';
import { EntityCrudPage } from '../../components/organization/EntityCrudPage';
import type { Team } from '../../types';

const columns: ColumnDef<Team, any>[] = [
  { accessorKey: 'name', header: 'Name' },
  { id: 'department', header: 'Department', cell: ({ row }) => row.original.department?.name ?? '—' },
];

export default function TeamsPage() {
  return (
    <EntityCrudPage<Team>
      resourceKey="teams"
      basePath="/organization/teams"
      resourcePermission="teams"
      title="Teams"
      description="Manage teams nested within departments."
      columns={columns}
      fields={[
        { key: 'name', label: 'Name', type: 'text', required: true },
        {
          key: 'departmentId',
          label: 'Department',
          type: 'text',
          required: true,
          optionsResource: { basePath: '/organization/departments', labelKey: 'name' },
        },
      ]}
      emptyForm={{ name: '', departmentId: '' }}
    />
  );
}
