import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Shield,
  Settings,
  Building2,
  MapPin,
  Briefcase,
  Key,
  GitBranch,
  Users2,
  Award,
  Layers,
  Table2,
  Rows3,
  Columns3,
  FormInput,
  Menu as MenuIcon,
  FileBarChart,
  Webhook,
  GitMerge,
  History,
  ScrollText,
  Lock,
  Flag,
} from 'lucide-react';
import clsx from 'clsx';

interface NavItem {
  name: string;
  to?: string;
  icon: typeof Users;
  soon?: boolean;
}

interface NavGroup {
  name: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    name: 'Organization',
    items: [
      { name: 'Companies', to: '/organization/companies', icon: Building2 },
      { name: 'Branches', to: '/organization/branches', icon: GitBranch },
      { name: 'Locations', to: '/organization/locations', icon: MapPin },
      { name: 'Departments', to: '/organization/departments', icon: Briefcase },
      { name: 'Teams', to: '/organization/teams', icon: Users2 },
      { name: 'Designations', to: '/organization/designations', icon: Award },
    ],
  },
  {
    name: 'User Management',
    items: [
      { name: 'Users', to: '/users', icon: Users },
      { name: 'Roles', to: '/roles', icon: Shield },
      { name: 'Permission Groups', to: '/permissions', icon: Key },
    ],
  },
  {
    name: 'Access Control',
    items: [
      { name: 'Page Permissions', icon: Layers, soon: true },
      { name: 'Action Permissions', icon: FormInput, soon: true },
      { name: 'Table Permissions', icon: Table2, soon: true },
      { name: 'Row Permissions', icon: Rows3, soon: true },
      { name: 'Column Permissions', icon: Columns3, soon: true },
      { name: 'Field Permissions', icon: FormInput, soon: true },
      { name: 'Menu Permissions', icon: MenuIcon, soon: true },
      { name: 'Report Permissions', icon: FileBarChart, soon: true },
      { name: 'API Permissions', icon: Webhook, soon: true },
    ],
  },
  {
    name: 'Workflow',
    items: [
      { name: 'Approval Matrix', icon: GitMerge, soon: true },
      { name: 'Workflow Rules', icon: GitMerge, soon: true },
    ],
  },
  {
    name: 'Security & Audit',
    items: [
      { name: 'Login Sessions', to: '/audit/sessions', icon: Lock },
      { name: 'Login History', to: '/audit/login-history', icon: History },
      { name: 'Audit Logs', to: '/audit/logs', icon: ScrollText },
      { name: 'Security Settings', icon: Shield, soon: true },
    ],
  },
  {
    name: 'System',
    items: [
      { name: 'System Settings', icon: Settings, soon: true },
      { name: 'Feature Flags', icon: Flag, soon: true },
    ],
  },
];

function NavLinkItem({ item }: { item: NavItem }) {
  if (item.soon || !item.to) {
    return (
      <div className="group flex cursor-not-allowed items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-muted-foreground/60">
        <span className="flex items-center">
          <item.icon className="mr-3 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          {item.name}
        </span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Soon</span>
      </div>
    );
  }

  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        clsx(
          'group flex items-center px-3 py-2 text-sm font-medium rounded-md',
          isActive ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-secondary hover:text-secondary-foreground'
        )
      }
    >
      <item.icon className="mr-3 h-4 w-4 flex-shrink-0" aria-hidden="true" />
      {item.name}
    </NavLink>
  );
}

export default function Sidebar() {
  return (
    <aside className="hidden w-64 h-full shrink-0 flex-col border-r bg-card md:flex">
      <div className="flex h-16 items-center border-b px-6">
        <Shield className="mr-3 h-7 w-7 text-primary" />
        <span className="text-lg font-bold tracking-tight text-foreground">ERP Admin</span>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto py-4">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            clsx(
              'mx-3 mb-2 flex items-center rounded-md px-3 py-2 text-sm font-medium',
              isActive ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-secondary'
            )
          }
        >
          <LayoutDashboard className="mr-3 h-4 w-4 flex-shrink-0" />
          Dashboard
        </NavLink>

        {NAV_GROUPS.map((group) => (
          <div key={group.name} className="px-3">
            <div className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.name}</div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLinkItem key={item.name} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
