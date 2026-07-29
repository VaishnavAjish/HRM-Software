import type { ColumnDef } from '@tanstack/react-table';
import { EntityCrudPage } from '../../components/organization/EntityCrudPage';
import type { Location } from '../../types';

const columns: ColumnDef<Location, any>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'type', header: 'Type' },
  { accessorKey: 'city', header: 'City' },
  { accessorKey: 'country', header: 'Country' },
  { id: 'branch', header: 'Branch', cell: ({ row }) => row.original.branch?.name ?? '—' },
];

export default function LocationsPage() {
  return (
    <EntityCrudPage<Location>
      resourceKey="locations"
      basePath="/organization/locations"
      resourcePermission="locations"
      title="Locations"
      description="Manage factories, warehouses, and offices across branches."
      columns={columns}
      fields={[
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'type', label: 'Type (Factory / Warehouse / Office)', type: 'text', required: true },
        {
          key: 'branchId',
          label: 'Branch',
          type: 'text',
          required: true,
          optionsResource: { basePath: '/organization/branches', labelKey: 'name' },
        },
        { key: 'country', label: 'Country', type: 'text' },
        { key: 'state', label: 'State', type: 'text' },
        { key: 'city', label: 'City', type: 'text' },
        { key: 'address', label: 'Address', type: 'text' },
      ]}
      emptyForm={{ name: '', type: '', branchId: '', country: '', state: '', city: '', address: '' }}
    />
  );
}
