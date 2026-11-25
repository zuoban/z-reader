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
    <section className="mx-auto w-full max-w-xl px-1 py-8 sm:px-8 sm:py-12">
      <div className="flex items-start gap-3.5 sm:gap-4">
        <div
          aria-hidden="true"
          className={cn(
            'mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border',
            tone === 'error'
              ? 'border-destructive/20 bg-destructive/10 text-destructive'
              : 'border-border/80 bg-accent/80 text-accent-foreground'
          )}
        >
          <Icon className="size-5" strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div role={tone === 'error' ? 'alert' : undefined}>
            <h2 className="font-heading text-xl font-normal leading-tight text-foreground sm:text-2xl">
              {title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
            {detail && (
              <p className="mt-2 [overflow-wrap:anywhere] text-xs leading-5 text-muted-foreground">
                {detail}
              </p>
            )}
          </div>
          {action && <div className="mt-4 flex flex-wrap gap-2">{action}</div>}
        </div>
      </div>
    </section>
  );
}
