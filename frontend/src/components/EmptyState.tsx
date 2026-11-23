'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  tags?: string[];
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  tags,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className="flex min-h-[52vh] items-center justify-center">
      <section
        className={cn(
          'paper-panel w-full max-w-xl rounded-2xl px-6 py-12 text-center sm:px-12 sm:py-14',
          className
        )}
      >
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-secondary text-primary">
          <Icon className="h-6 w-6" strokeWidth={1.5} />
        </div>

        <div className="space-y-2.5">
          <h2 className="font-heading text-2xl font-medium leading-tight text-foreground sm:text-3xl">
            {title}
          </h2>
          <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground sm:text-[15px]">
            {description}
          </p>
        </div>

        {tags && tags.length > 0 && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="paper-chip rounded-md px-2.5 py-1 font-mono text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {action && <div className="mt-8 flex justify-center">{action}</div>}
      </section>
    </div>
  );
}
