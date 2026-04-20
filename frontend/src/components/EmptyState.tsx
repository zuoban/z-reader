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
    <div className="flex min-h-[58vh] items-center justify-center">
      <section
        className={cn(
          'relative w-full max-w-xl rounded-lg border border-border/75 bg-card/95 px-6 py-12 text-center shadow-[0_28px_70px_-54px_rgba(15,23,42,0.34),0_12px_24px_-18px_rgba(15,23,42,0.1)] backdrop-blur-sm sm:px-14 sm:py-14',
          className
        )}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/8 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-foreground/8 to-transparent" />

        <div className="relative mx-auto mb-8 inline-flex">
          <div className="relative flex h-20 w-20 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]">
            <Icon className="h-10 w-10 text-primary" />
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
            {title}
          </h2>
          <p className="mx-auto max-w-sm text-[15px] leading-7 text-muted-foreground sm:text-base">
            {description}
          </p>
        </div>

        {tags && tags.length > 0 && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-lg border border-border/70 bg-muted/45 px-3 py-1 text-xs font-semibold leading-5 text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {action && <div className="mt-10 flex justify-center">{action}</div>}
      </section>
    </div>
  );
}
