import { useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil } from 'lucide-react';
import { api } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { RoleFormDrawer } from './RoleFormDrawer';
import { useCrudResource } from '../../hooks/useCrudResource';
import { useAuthStore } from '../../store/authStore';
import type { Role } from '../../types';

const TABS = ['Overview', 'Assigned Users', 'Permissions'] as const;
type Tab = (typeof TABS)[number];

export default function RoleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('Overview');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const roleQuery = useQuery({
    queryKey: ['roles', id],
    queryFn: async () => (await api.get<Role>(`/roles/${id}`)).data,
    enabled: !!id,
  });

  const { updateMutation } = useCrudResource<Role>('roles', '/roles', { page: 1 });

  const grouped = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const rp of roleQuery.data?.permissions ?? []) {
      const list = map.get(rp.permission.resource) ?? [];
      list.push(rp.permission.action);
      map.set(rp.permission.resource, list);
    }
    return Array.from(map.entries());
  }, [roleQuery.data]);

  if (roleQuery.isLoading || !roleQuery.data) {
    return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  }

  const role = roleQuery.data;

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/roles')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Roles
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">{role.name}</h2>
          <p className="text-sm text-muted-foreground">{role.description ?? 'No description'}</p>
        </div>
        {hasPermission('roles', 'edit') && (
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            <Pencil className="h-4 w-4" /> Edit
          </button>
        )}
      </div>

      <div className="border-b">
        <nav className="-mb-px flex gap-6">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`border-b-2 px-1 pb-3 text-sm font-medium ${
                tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'Overview' && (
        <dl className="grid grid-cols-2 gap-4 rounded-xl border bg-card p-6 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Type</dt>
            <dd className="mt-1 text-sm text-foreground">{role.isSystem ? 'System Role' : 'Custom Role'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Permissions</dt>
            <dd className="mt-1 text-sm text-foreground">{role.permissions.length}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Assigned Users</dt>
            <dd className="mt-1 text-sm text-foreground">{role.users?.length ?? 0}</dd>
          </div>
        </dl>
      )}

      {tab === 'Assigned Users' && (
        <div className="divide-y rounded-xl border bg-card">
          {(role.users ?? []).length === 0 && <p className="p-6 text-sm text-muted-foreground">No users assigned to this role.</p>}
          {role.users?.map((ur) => (
            <Link key={ur.userId} to={`/users/${ur.userId}`} className="flex items-center justify-between px-6 py-3 hover:bg-muted/30">
              <span className="text-sm font-medium text-foreground">{ur.user.fullName}</span>
              <span className="text-sm text-muted-foreground">{ur.user.email}</span>
            </Link>
          ))}
        </div>
      )}

      {tab === 'Permissions' && (
        <div className="space-y-4 rounded-xl border bg-card p-6">
          {grouped.length === 0 && <p className="text-sm text-muted-foreground">No permissions assigned.</p>}
          {grouped.map(([resource, actions]) => (
            <div key={resource}>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{resource}</h4>
              <div className="flex flex-wrap gap-1.5">
                {actions.map((action) => (
                  <Badge key={action}>{action}</Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <RoleFormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        role={role}
        onSubmit={async (payload) => {
          await updateMutation.mutateAsync({ id: role.id, payload });
          queryClient.invalidateQueries({ queryKey: ['roles', id] });
        }}
      />
    </div>
  );
}
