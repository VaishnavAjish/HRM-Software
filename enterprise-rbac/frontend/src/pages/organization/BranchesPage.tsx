import type { ColumnDef } from '@tanstack/react-table';
import { EntityCrudPage } from '../../components/organization/EntityCrudPage';
import type { Branch } from '../../types';

const columns: ColumnDef<Branch, any>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'code', header: 'Code' },
  { id: 'company', header: 'Company', cell: ({ row }) => row.original.company?.name ?? '—' },
];

export default function BranchesPage() {
  return (
    <EntityCrudPage<Branch>
      resourceKey="branches"
      basePath="/organization/branches"
      resourcePermission="branches"
      title="Branches"
      description="Manage branches belonging to each company."
      columns={columns}
      fields={[
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'code', label: 'Code', type: 'text', required: true },
        {
          key: 'companyId',
          label: 'Company',
          type: 'text',
          required: true,
          optionsResource: { basePath: '/organization/companies', labelKey: 'name' },
        },
      ]}
      emptyForm={{ name: '', code: '', companyId: '' }}
    />
  );
}
