'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AppScreenProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  ambient?: 'none' | 'login' | 'shelf';
}

function AmbientLayer({ variant }: { variant: AppScreenProps['ambient'] }) {
  if (variant === 'shelf') {
    return (
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--shelf-surface-soft)_78%,transparent)_0%,transparent_52%),linear-gradient(180deg,color-mix(in_srgb,var(--paper-edge)_22%,transparent)_0%,transparent_28%)]" />
        <div className="absolute -left-[12%] top-[8%] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--primary)_5%,transparent)_0%,transparent_68%)] blur-2xl" />
        <div className="absolute -right-[10%] bottom-[6%] h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--paper-edge)_35%,transparent)_0%,transparent_70%)] blur-2xl" />
        <div className="absolute inset-0 opacity-0 dark:opacity-100 dark:bg-[linear-gradient(180deg,rgba(240,230,210,0.04)_0%,transparent_36%,rgba(0,0,0,0.14)_100%)]" />
      </div>
    );
  }

  if (variant === 'login') {
    return (
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,color-mix(in_srgb,var(--shelf-surface-soft)_88%,transparent)_0%,transparent_55%),linear-gradient(180deg,transparent_40%,color-mix(in_srgb,var(--paper-edge)_28%,transparent)_100%)]" />
        <div className="absolute left-[8%] top-[18%] h-64 w-64 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--primary)_6%,transparent)_0%,transparent_70%)] blur-2xl" />
        <div className="absolute right-[6%] bottom-[14%] h-72 w-72 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--paper-edge)_40%,transparent)_0%,transparent_72%)] blur-2xl" />
      </div>
    );
  }

  return null;
}

export function AppScreen({
  children,
  className,
  contentClassName,
  ambient = 'none',
}: AppScreenProps) {
  return (
    <div className={cn('relative min-h-screen overflow-hidden bg-background text-foreground', className)}>
      <AmbientLayer variant={ambient} />
      <div
        id="main-content"
        tabIndex={-1}
        className={cn('relative z-10 min-h-screen outline-none', contentClassName)}
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
        rx="15"
        className="fill-[#1c1915] dark:fill-primary"
      />
      <path
        d="M18 20.2C22.7 17.8 27.6 18 32 21.1V45.8C27.6 42.9 22.7 42.7 18 45.2V20.2Z"
        className="fill-[#f0e6d2] dark:fill-[#1c1915]"
      />
      <path
        d="M32 21.1C36.4 18 41.3 17.8 46 20.2V45.2C41.3 42.7 36.4 42.9 32 45.8V21.1Z"
        className="fill-[#faf7f1] dark:fill-[#2a2420]"
      />
      <path
        d="M24.1 26.1H39.8L28.2 38.1H40.2"
        className="stroke-[#1c1915] dark:stroke-primary"
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
    <div className={cn('inline-flex items-center gap-2.5 text-foreground', className)}>
      <BrandGlyph className={compact ? 'h-8 w-8' : 'h-9 w-9'} />
      <div className="flex items-baseline gap-1.5">
        <span className={cn('font-heading text-[1.45rem] font-semibold leading-none tracking-[-0.045em]', compact && 'text-[1.25rem]')}>
          Z
        </span>
        <span className={cn('text-[1.05rem] font-bold leading-none tracking-[-0.035em]', compact && 'text-[0.98rem]')}>
          Reader
        </span>
      </div>
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
        'rounded-2xl border border-border/40 bg-card/50 p-6 backdrop-blur-md',
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
        <p className="text-[15px] font-bold text-foreground">{title}</p>
        {description && (
          <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
        )}
      </div>
    </>
  );

  return (
    <div className={cn('flex min-h-screen items-center justify-center px-6 py-12', className)}>
      <div
        className={cn(
          'flex flex-col items-center',
          card && 'rounded-[2rem] border border-border/40 bg-card/50 p-12 backdrop-blur-xl'
        )}
      >
        {content}
      </div>
    </div>
  );
}
