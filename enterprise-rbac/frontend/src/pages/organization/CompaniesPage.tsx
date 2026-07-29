import type { ColumnDef } from '@tanstack/react-table';
import { EntityCrudPage } from '../../components/organization/EntityCrudPage';
import type { Company } from '../../types';

const columns: ColumnDef<Company, any>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'code', header: 'Code' },
  { accessorKey: 'currency', header: 'Currency' },
  { accessorKey: 'createdAt', header: 'Created', cell: ({ getValue }) => new Date(getValue<string>()).toLocaleDateString() },
];

export default function CompaniesPage() {
  return (
    <EntityCrudPage<Company>
      resourceKey="companies"
      basePath="/organization/companies"
      resourcePermission="companies"
      title="Companies"
      description="Manage the top-level companies in your organization hierarchy."
      columns={columns}
      fields={[
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'code', label: 'Code', type: 'text', required: true },
        { key: 'currency', label: 'Currency', type: 'text', required: true },
      ]}
      emptyForm={{ name: '', code: '', currency: 'USD' }}
    />
  );
}
