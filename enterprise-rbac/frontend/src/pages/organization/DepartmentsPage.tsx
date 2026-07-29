import type { ColumnDef } from '@tanstack/react-table';
import { EntityCrudPage } from '../../components/organization/EntityCrudPage';
import type { Department } from '../../types';

const columns: ColumnDef<Department, any>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'code', header: 'Code' },
];

export default function DepartmentsPage() {
  return (
    <EntityCrudPage<Department>
      resourceKey="departments"
      basePath="/organization/departments"
      resourcePermission="departments"
      title="Departments"
      description="Manage organizational departments (Planning, Purchase, QC, etc.)."
      columns={columns}
      fields={[
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'code', label: 'Code', type: 'text', required: true },
      ]}
      emptyForm={{ name: '', code: '' }}
    />
  );
}
