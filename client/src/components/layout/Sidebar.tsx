import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  Users,
  Building2,
  Clock,
  CalendarDays,
  DollarSign,
  UserPlus,
  TrendingUp,
  Settings,
  UserCircle,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useUIStore } from '../../store/uiStore';

interface NavItem {
  name: string;
  path: string;
  icon: React.ReactNode;
}

export const Sidebar: React.FC = () => {
  const { user, logout } = useAuth();
  const { sidebar, toggleSidebar } = useUIStore();
  const location = useLocation();

  const isSidebarCollapsed = sidebar === 'collapsed';

  const navigation: NavItem[] = [
    { name: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
    { name: 'Employees', path: '/employees', icon: <Users className="h-5 w-5" /> },
    { name: 'Departments', path: '/departments', icon: <Building2 className="h-5 w-5" /> },
    { name: 'Attendance', path: '/attendance', icon: <Clock className="h-5 w-5" /> },
    { name: 'Leaves', path: '/leave', icon: <CalendarDays className="h-5 w-5" /> },
    { name: 'Payroll', path: '/payroll', icon: <DollarSign className="h-5 w-5" /> },
    { name: 'Recruitment', path: '/recruitment', icon: <UserPlus className="h-5 w-5" /> },
    { name: 'Performance', path: '/performance', icon: <TrendingUp className="h-5 w-5" /> },
    { name: 'Settings', path: '/settings', icon: <Settings className="h-5 w-5" /> },
    { name: 'Profile', path: '/profile', icon: <UserCircle className="h-5 w-5" /> },
  ];

  return (
    <aside
      className={clsx(
        'relative flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all duration-300 z-30',
        isSidebarCollapsed ? 'w-20' : 'w-64'
      )}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800">
        <NavLink to="/dashboard" className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-md">
            <Sparkles className="h-6 w-6" />
          </div>
          {!isSidebarCollapsed && (
            <div className="flex flex-col">
              <span className="font-bold text-lg leading-tight tracking-wide text-slate-900 dark:text-white">
                HRFlow<span className="text-indigo-600 dark:text-indigo-400">Pro</span>
              </span>
              <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">
                Enterprise HRMS
              </span>
            </div>
          )}
        </NavLink>

        <button
          onClick={toggleSidebar}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {isSidebarCollapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Navigation items */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navigation.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors relative group',
                isActive
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
              )}
            >
              <span className={clsx(isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200')}>
                {item.icon}
              </span>
              {!isSidebarCollapsed && (
                <span className="truncate flex-1">{item.name}</span>
              )}

              {/* Tooltip on collapsed sidebar */}
              {isSidebarCollapsed && (
                <div className="absolute left-full ml-2 hidden rounded-md bg-slate-900 text-white text-xs px-2.5 py-1 font-medium whitespace-nowrap z-50 group-hover:block shadow-lg">
                  {item.name}
                </div>
              )}
            </NavLink>
          );
        })}
      </div>

      {/* User profile & Logout footer */}
      <div className="border-t border-slate-200 dark:border-slate-800 p-3">
        <div className={clsx('flex items-center gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 p-2', isSidebarCollapsed && 'justify-center')}>
          <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
            {user?.firstName?.[0] || 'U'}
          </div>
          {!isSidebarCollapsed && (
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-[10px] text-slate-400 capitalize truncate">{user?.role || 'Employee'}</p>
            </div>
          )}
          {!isSidebarCollapsed && (
            <button
              onClick={logout}
              title="Logout"
              className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
