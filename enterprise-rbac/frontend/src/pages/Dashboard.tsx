import { useQuery } from '@tanstack/react-query';
import { Users, Shield, Building2, Key, Layers, Activity } from 'lucide-react';
import { api } from '../lib/api';
import type { DashboardStats } from '../types';

type NumericStatKey = Exclude<keyof DashboardStats, 'recentActivity'>;

const CARDS: { key: NumericStatKey; label: string; icon: typeof Users }[] = [
  { key: 'totalUsers', label: 'Total Users', icon: Users },
  { key: 'activeUsers', label: 'Active Users', icon: Activity },
  { key: 'totalRoles', label: 'Active Roles', icon: Shield },
  { key: 'totalPermissionGroups', label: 'Permission Groups', icon: Key },
  { key: 'totalCompanies', label: 'Companies', icon: Building2 },
  { key: 'totalBranches', label: 'Branches', icon: Layers },
];

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => (await api.get<DashboardStats>('/dashboard/stats')).data,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h2>
        <p className="text-muted-foreground">Overview of your enterprise RBAC system.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {CARDS.map(({ key, label, icon: Icon }) => (
          <div key={key} className="rounded-xl border bg-card text-card-foreground shadow-sm">
            <div className="flex flex-row items-center justify-between space-y-0 p-6 pb-2">
              <h3 className="text-sm font-medium tracking-tight">{label}</h3>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="p-6 pt-0">
              {isLoading ? (
                <div className="h-8 w-16 animate-pulse rounded bg-muted" />
              ) : (
                <div className="text-2xl font-bold">{data?.[key] ?? 0}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
        </div>
        <div className="divide-y">
          {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
          {!isLoading && (data?.recentActivity.length ?? 0) === 0 && (
            <div className="p-6 text-sm text-muted-foreground">No recent activity.</div>
          )}
          {data?.recentActivity.map((log) => (
            <div key={log.id} className="flex items-center justify-between px-6 py-3 text-sm">
              <span className="text-foreground">
                <span className="font-medium">{log.user?.fullName ?? 'System'}</span> {log.action.toLowerCase()}d {log.resource}
              </span>
              <span className="text-muted-foreground">{new Date(log.timestamp).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
