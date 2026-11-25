'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AppScreenProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function AppScreen({
  children,
  className,
  contentClassName,
}: AppScreenProps) {
  return (
    <div className={cn('relative min-h-dvh overflow-x-clip bg-background text-foreground', className)}>
      <div
        id="main-content"
        tabIndex={-1}
        className={cn('relative z-10 min-h-dvh outline-none', contentClassName)}
      >
        {children}
      </div>
    </div>
  );
}

interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg';
  framed?: boolean;
  className?: string;
  priority?: boolean;
}

const brandSizes = {
  sm: 'scale-[0.82]',
  md: 'scale-100',
  lg: 'scale-[1.12]',
};

export function BrandLogo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('inline-flex items-center gap-2.5 text-foreground', className)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        className={cn('shrink-0', compact ? 'size-6' : 'size-7')}
      >
        <rect
          x="3"
          y="2.5"
          width="18"
          height="19"
          rx="3"
          className="fill-card stroke-foreground/80 dark:fill-secondary dark:stroke-foreground/70"
          strokeWidth="1.5"
        />
        <line
          x1="7.5"
          y1="3.25"
          x2="7.5"
          y2="20.75"
          className="stroke-foreground/25"
          strokeWidth="1.25"
        />
        <path
          d="M14.25 3.25H17.75V10.5L16 9.1L14.25 10.5V3.25Z"
          className="fill-primary"
        />
        <path
          d="M10.5 13.5H16.25L10.75 18H16.5"
          className="stroke-foreground"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className={cn(
          'font-heading font-semibold leading-none tracking-normal text-foreground',
          compact ? 'text-base' : 'text-lg'
        )}
      >
        Z Reader
      </span>
    </div>
  );
}

export function BrandMark({
  size = 'md',
  framed = false,
  className,
}: BrandMarkProps) {
  const logo = <BrandLogo className={cn('origin-center', brandSizes[size])} />;

  if (!framed) {
    return <div className={cn('flex items-center justify-center', className)}>{logo}</div>;
  }

  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card p-6',
        className
      )}
    >
      {logo}
    </div>
  );
}

interface LoadingStateProps {
  title?: string;
  description?: string;
  showLogo?: boolean;
  card?: boolean;
  className?: string;
}

export function LoadingSpinner({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary motion-reduce:animate-none',
        className
      )}
    />
  );
}

export function LoadingState({
  title = '加载中...',
  description,
  showLogo = false,
  card = false,
  className,
}: LoadingStateProps) {
  const content = (
    <>
      {showLogo && <BrandMark size="md" priority className="mb-4" />}
      <LoadingSpinner />
      <div className="mt-4 text-center">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </>
  );

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex min-h-dvh items-center justify-center pl-[max(1.5rem,env(safe-area-inset-left,0px))] pr-[max(1.5rem,env(safe-area-inset-right,0px))] pt-[max(3rem,env(safe-area-inset-top,0px))] pb-[max(3rem,env(safe-area-inset-bottom,0px))]',
        className
      )}
    >
      <div
        className={cn(
          'flex flex-col items-center',
          card && 'paper-panel rounded-2xl p-8 sm:p-10'
        )}
      >
        {content}
      </div>
    </div>
  );
}
