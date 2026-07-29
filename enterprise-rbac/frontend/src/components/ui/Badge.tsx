import type { ReactNode } from 'react';
import clsx from 'clsx';

type BadgeTone = 'default' | 'success' | 'warning' | 'destructive' | 'muted';

const TONE_CLASSES: Record<BadgeTone, string> = {
  default: 'bg-primary/10 text-primary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
  muted: 'bg-muted text-muted-foreground',
};

export function Badge({ tone = 'default', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', TONE_CLASSES[tone])}>
      {children}
    </span>
  );
}
