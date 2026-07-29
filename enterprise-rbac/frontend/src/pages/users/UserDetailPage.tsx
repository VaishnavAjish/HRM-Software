import { useState, type ReactNode } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock, Unlock } from 'lucide-react';
import { api, extractErrorMessage } from '../../lib/api';
import { useSimpleList } from '../../hooks/useSimpleList';
import { Badge } from '../../components/ui/Badge';
import type { AppUser, AuditLog, Permission } from '../../types';

const TABS = ['Profile', 'Organization', 'Roles', 'Permissions', 'Security', 'Activity'] as const;
type Tab = (typeof TABS)[number];

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('Profile');
  const queryClient = useQueryClient();

  const userQuery = useQuery({
    queryKey: ['users', id],
    queryFn: async () => (await api.get<AppUser>(`/users/${id}`)).data,
    enabled: !!id,
  });

  const auditQuery = useQuery({
    queryKey: ['audit-logs', 'resource', id],
    queryFn: async () => (await api.get<{ data: AuditLog[] }>('/audit/logs', { params: { resource: 'users', resourceId: id } })).data.data,
    enabled: !!id && tab === 'Activity',
  });

  const { data: allPermissions } = useSimpleList<Permission>('/permissions', tab === 'Permissions');

  const unlockMutation = useMutation({
    mutationFn: () => api.post(`/users/${id}/unlock`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users', id] }),
  });

  const overridesMutation = useMutation({
    mutationFn: (overrides: { permissionId: string; isRevoked: boolean }[]) => api.put(`/users/${id}/permissions`, { overrides }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users', id] }),
  });

  if (userQuery.isLoading) {
    return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  }

  if (userQuery.isError || !userQuery.data) {
    return <div className="text-destructive">{extractErrorMessage(userQuery.error)}</div>;
  }

  const user = userQuery.data;
  const overrideMap = new Map(user.permissions?.map((p) => [p.permissionId, p.isRevoked]));

  function toggleOverride(permissionId: string, nextState: 'grant' | 'revoke' | 'none') {
    const current = user!.permissions ?? [];
    const filtered = current.filter((p) => p.permissionId !== permissionId).map((p) => ({ permissionId: p.permissionId, isRevoked: p.isRevoked }));
    if (nextState !== 'none') {
      filtered.push({ permissionId, isRevoked: nextState === 'revoke' });
    }
    overridesMutation.mutate(filtered);
  }

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/users')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Users
      </button>

      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
          {user.fullName
            .split(' ')
            .map((n) => n[0])
            .slice(0, 2)
            .join('')}
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">{user.fullName}</h2>
          <p className="text-sm text-muted-foreground">
            @{user.username} · {user.email}
          </p>
        </div>
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

      {tab === 'Profile' && (
        <dl className="grid grid-cols-2 gap-4 rounded-xl border bg-card p-6 sm:grid-cols-3">
          <Info label="Employee Code" value={user.empCode ?? '—'} />
          <Info label="Phone" value={user.phone ?? '—'} />
          <Info label="Status" value={<Badge tone={user.status === 'ACTIVE' ? 'success' : 'muted'}>{user.status}</Badge>} />
          <Info label="Designation" value={user.designation?.title ?? '—'} />
          <Info label="Timezone" value={user.timezone} />
          <Info label="Language" value={user.language} />
          <Info label="Joining Date" value={user.joiningDate ? new Date(user.joiningDate).toLocaleDateString() : '—'} />
          <Info label="Reporting Manager" value={user.manager?.fullName ?? '—'} />
        </dl>
      )}

      {tab === 'Organization' && (
        <dl className="grid grid-cols-2 gap-4 rounded-xl border bg-card p-6 sm:grid-cols-3">
          <Info label="Company" value={user.company?.name ?? '—'} />
          <Info label="Branch" value={user.branch?.name ?? '—'} />
          <Info label="Location" value={user.location?.name ?? '—'} />
          <Info label="Department" value={user.department?.name ?? '—'} />
          <Info label="Team" value={user.team?.name ?? '—'} />
        </dl>
      )}

      {tab === 'Roles' && (
        <div className="rounded-xl border bg-card p-6">
          <div className="flex flex-wrap gap-2">
            {user.roles.length === 0 && <p className="text-sm text-muted-foreground">No roles assigned.</p>}
            {user.roles.map((r) => (
              <Link key={r.roleId} to={`/roles/${r.roleId}`}>
                <Badge>{r.role.name}</Badge>
              </Link>
            ))}
          </div>
        </div>
      )}

      {tab === 'Permissions' && (
        <div className="rounded-xl border bg-card">
          <div className="border-b px-6 py-4">
            <h3 className="text-sm font-semibold text-foreground">Explicit Permission Overrides</h3>
            <p className="text-xs text-muted-foreground">
              Overrides take precedence over role-derived permissions. "Grant" force-allows; "Revoke" force-denies.
            </p>
          </div>
          <div className="divide-y">
            {allPermissions?.map((perm) => {
              const state = overrideMap.has(perm.id) ? (overrideMap.get(perm.id) ? 'revoke' : 'grant') : 'none';
              return (
                <div key={perm.id} className="flex items-center justify-between px-6 py-2.5">
                  <span className="text-sm text-foreground">{perm.name}</span>
                  <div className="flex gap-1">
                    {(['none', 'grant', 'revoke'] as const).map((opt) => (
                      <button
                        key={opt}
                        onClick={() => toggleOverride(perm.id, opt)}
                        className={`rounded-md px-2 py-1 text-xs font-medium capitalize ${
                          state === opt
                            ? opt === 'revoke'
                              ? 'bg-destructive text-destructive-foreground'
                              : opt === 'grant'
                                ? 'bg-success text-success-foreground'
                                : 'bg-muted text-muted-foreground'
                            : 'text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {opt === 'none' ? 'Inherit' : opt}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'Security' && (
        <div className="space-y-4 rounded-xl border bg-card p-6">
          <Info label="Failed Login Attempts" value={String(user.failedAttempts)} />
          <Info
            label="Account Lock"
            value={
              user.lockedUntil && new Date(user.lockedUntil) > new Date()
                ? `Locked until ${new Date(user.lockedUntil).toLocaleString()}`
                : 'Not locked'
            }
          />
          <Info label="MFA Enabled" value={user.mfaEnabled ? 'Yes' : 'No'} />
          <button
            onClick={() => unlockMutation.mutate()}
            disabled={unlockMutation.isPending}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {user.lockedUntil && new Date(user.lockedUntil) > new Date() ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            Unlock / Reset Failed Attempts
          </button>
        </div>
      )}

      {tab === 'Activity' && (
        <div className="rounded-xl border bg-card">
          <div className="divide-y">
            {auditQuery.isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
            {auditQuery.data?.length === 0 && <div className="p-6 text-sm text-muted-foreground">No activity recorded.</div>}
            {auditQuery.data?.map((log) => (
              <div key={log.id} className="flex items-center justify-between px-6 py-3 text-sm">
                <span className="font-medium text-foreground">{log.action}</span>
                <span className="text-muted-foreground">{new Date(log.timestamp).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}
