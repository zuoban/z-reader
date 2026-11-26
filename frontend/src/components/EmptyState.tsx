'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  detail?: ReactNode;
  tone?: 'default' | 'error';
  action?: ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  detail,
  tone = 'default',
  action,
}: EmptyStateProps) {
  return (
    <section className="mx-auto my-6 w-full max-w-lg sm:my-10">
      <div className="paper-panel flex flex-col items-center rounded-2xl px-6 py-10 text-center sm:px-10 sm:py-12">
        <div
          aria-hidden="true"
          className={cn(
            'flex size-12 items-center justify-center rounded-2xl border',
            tone === 'error'
              ? 'border-destructive/20 bg-destructive/10 text-destructive'
              : 'app-sheet-icon border-primary/15'
          )}
        >
          <Icon className="size-5" strokeWidth={1.6} />
        </div>
        <div className="mt-5 min-w-0 max-w-md">
          <div role={tone === 'error' ? 'alert' : undefined}>
            <h2 className="font-heading text-xl font-normal leading-tight text-foreground sm:text-2xl">
              {title}
            </h2>
            <p className="mt-2.5 text-sm leading-6 text-muted-foreground">{description}</p>
            {detail && (
              <p className="mt-2 [overflow-wrap:anywhere] text-xs leading-5 text-muted-foreground">
                {detail}
              </p>
            )}
          </div>
          {action && <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">{action}</div>}
        </div>
      </div>
    </section>
  );
}
