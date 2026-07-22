import React from 'react';
import { clsx } from 'clsx';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: {
    value: string;
    isPositive: boolean;
    label?: string;
  };
  description?: string;
  badgeText?: string;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  trend,
  description,
  badgeText,
  className,
}) => {
  return (
    <div
      className={clsx(
        'relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm transition-all hover:shadow-md',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</span>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
          {icon}
        </div>
      </div>

      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          {value}
        </span>
        {badgeText && (
          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
            {badgeText}
          </span>
        )}
      </div>

      {(trend || description) && (
        <div className="mt-3 flex items-center text-xs text-slate-500 dark:text-slate-400">
          {trend && (
            <span
              className={clsx(
                'mr-2 inline-flex items-center font-semibold',
                trend.isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              )}
            >
              {trend.isPositive ? (
                <ArrowUpRight className="mr-0.5 h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight className="mr-0.5 h-3.5 w-3.5" />
              )}
              {trend.value}
            </span>
          )}
          <span>{trend?.label || description}</span>
        </div>
      )}
    </div>
  );
};
