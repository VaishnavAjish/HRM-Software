import type { ColumnDef } from '@tanstack/react-table';
import { EntityCrudPage } from '../../components/organization/EntityCrudPage';
import type { Designation } from '../../types';

const columns: ColumnDef<Designation, any>[] = [
  { accessorKey: 'title', header: 'Title' },
  { accessorKey: 'level', header: 'Hierarchy Level' },
];

export default function DesignationsPage() {
  return (
    <EntityCrudPage<Designation>
      resourceKey="designations"
      basePath="/organization/designations"
      resourcePermission="designations"
      title="Designations"
      description="Manage job titles and their hierarchy level."
      columns={columns}
      fields={[
        { key: 'title', label: 'Title', type: 'text', required: true },
        { key: 'level', label: 'Hierarchy Level', type: 'number', required: true },
      ]}
      emptyForm={{ title: '', level: '0' }}
    />
  );
}
