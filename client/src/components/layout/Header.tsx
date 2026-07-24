import React from 'react';
import { Search, Bell, Sun, Moon, UserCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useUIStore } from '../../store/uiStore';

export const Header: React.FC = () => {
  const { user } = useAuth();
  const { theme, toggleTheme } = useUIStore();

  return (
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 px-6 backdrop-blur-md">
      {/* Global Search Bar */}
      <div className="flex items-center w-full max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search employees, departments, records..."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 pl-9 pr-4 py-1.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
          />
        </div>
      </div>

      {/* Header Controls */}
      <div className="flex items-center gap-3">
        {/* Theme Switcher */}
        <button
          onClick={toggleTheme}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
          title="Toggle Theme"
        >
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        {/* Notifications */}
        <button
          className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
          title="Notifications"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-indigo-600 ring-2 ring-white dark:ring-slate-900" />
        </button>

        {/* User Menu Quick Info */}
        <div className="ml-2 flex items-center gap-2 border-l border-slate-200 dark:border-slate-800 pl-4">
          <UserCircle className="h-8 w-8 text-slate-400" />
          <div className="hidden md:flex flex-col">
            <span className="text-xs font-semibold text-slate-900 dark:text-white leading-tight">
              {user?.firstName} {user?.lastName}
            </span>
            <span className="text-[10px] text-slate-400 capitalize">{user?.role}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
