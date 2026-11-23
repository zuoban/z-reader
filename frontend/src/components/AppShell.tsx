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
    <div className={cn('relative min-h-dvh overflow-hidden bg-background text-foreground', className)}>
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

export function BrandGlyph({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      className={cn('h-9 w-9 shrink-0', className)}
      fill="none"
    >
      <rect
        x="8"
        y="8"
        width="48"
        height="48"
        rx="12"
        className="fill-primary"
      />
      <path
        d="M18 20.2C22.7 17.8 27.6 18 32 21.1V45.8C27.6 42.9 22.7 42.7 18 45.2V20.2Z"
        className="fill-primary-foreground opacity-80"
      />
      <path
        d="M32 21.1C36.4 18 41.3 17.8 46 20.2V45.2C41.3 42.7 36.4 42.9 32 45.8V21.1Z"
        className="fill-primary-foreground"
      />
      <path
        d="M24.1 26.1H39.8L28.2 38.1H40.2"
        className="stroke-primary"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4.2"
      />
    </svg>
  );
}

export function BrandLogo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('inline-flex items-center gap-2 text-foreground', className)}>
      <BrandGlyph className={compact ? 'h-7 w-7' : 'h-8 w-8'} />
      <span
        className={cn(
          'font-heading font-medium leading-none tracking-[-0.015em] text-foreground',
          compact ? 'text-[17px]' : 'text-lg'
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
      className={cn('h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary', className)}
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
    <div className={cn('flex min-h-dvh items-center justify-center px-6 py-12', className)}>
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
