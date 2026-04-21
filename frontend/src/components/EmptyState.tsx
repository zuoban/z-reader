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
          'paper-panel paper-stack relative w-full max-w-2xl rounded-[2rem] px-6 py-12 text-center sm:px-14 sm:py-16',
          className
        )}
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.9),transparent)]"
        />
        <div className="relative mx-auto mb-8 inline-flex">
          <div className="relative flex h-[5.5rem] w-[5.5rem] items-center justify-center rounded-[1.75rem] border border-primary/18 bg-[linear-gradient(180deg,rgba(255,255,255,0.42),rgba(255,255,255,0.1)),linear-gradient(145deg,color-mix(in_srgb,var(--primary)_12%,white_88%),color-mix(in_srgb,var(--primary)_8%,transparent))] shadow-[0_16px_30px_-26px_var(--paper-shadow)]">
            <Icon className="h-10 w-10 text-primary" />
          </div>
        </div>

        <div className="space-y-3.5">
          <p className="text-[11px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
            Personal Library
          </p>
          <h2 className="font-heading text-[2rem] font-semibold leading-tight tracking-[-0.04em] text-foreground sm:text-[2.6rem]">
            {title}
          </h2>
          <p className="mx-auto max-w-md text-[15px] leading-8 text-muted-foreground sm:text-base">
            {description}
          </p>
        </div>

        {tags && tags.length > 0 && (
          <div className="mt-7 flex flex-wrap justify-center gap-2.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="paper-chip rounded-full px-3.5 py-1.5 text-xs font-semibold tracking-[0.08em] leading-5 text-muted-foreground"
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
