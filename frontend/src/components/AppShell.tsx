'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useShelfTheme } from '@/hooks/useShelfTheme';

interface AppScreenProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  ambient?: 'none' | 'login' | 'shelf';
}

function AmbientLayer({ variant }: { variant: AppScreenProps['ambient'] }) {
  if (variant === 'shelf') {
    return null;
  }

  if (variant === 'login') {
    return (
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 login-ambient-bg" />
        <div className="absolute inset-x-0 top-0 h-44 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--primary)_16%,transparent),transparent)]" />
        <div className="absolute left-[9%] top-[10%] h-40 w-56 rotate-[-8deg] rounded-[2rem] border border-border/20 bg-card/22 shadow-[0_32px_48px_-42px_var(--paper-shadow)]" />
        <div className="absolute bottom-[9%] right-[10%] h-44 w-64 rotate-[6deg] rounded-[2rem] border border-border/18 bg-card/18 shadow-[0_38px_54px_-44px_var(--paper-shadow)]" />
        <div className="absolute left-[18%] top-[16%] h-28 w-40 rotate-[4deg] rounded-[1.5rem] border border-border/16 bg-card/16 shadow-[0_26px_40px_-38px_var(--paper-shadow)]" />
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
      <div className={cn('relative z-10 min-h-screen', contentClassName)}>
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
  sm: 'w-[132px]',
  md: 'w-[180px]',
  lg: 'w-[200px]',
};

export function BrandMark({
  size = 'md',
  framed = false,
  className,
  priority = false,
}: BrandMarkProps) {
  const { isDark } = useShelfTheme();

  const logo = (
    <Image
      src={isDark ? '/icons/logo-wordmark.svg' : '/icons/logo-wordmark-light.svg'}
      alt="Z Reader"
      width={216}
      height={66}
      className={cn('h-auto', brandSizes[size])}
      priority={priority}
    />
  );

  if (!framed) {
    return <div className={className}>{logo}</div>;
  }

  return (
    <div
      className={cn(
        'paper-panel paper-stack rounded-2xl px-5 py-3',
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
  inverted = false,
}: {
  className?: string;
  inverted?: boolean;
}) {
  return (
    <div
      className={cn('h-10 w-10 animate-spin rounded-full border-2 border-foreground/20 shadow-[0_0_0_1px_rgba(255,255,255,0.14)]', className)}
      style={{ borderTopColor: inverted ? 'var(--background)' : 'var(--foreground)' }}
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
      {showLogo && <BrandMark size="md" priority />}
      <LoadingSpinner />
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </>
  );

  return (
    <div className={cn('flex min-h-screen items-center justify-center px-5 py-6', className)}>
      <div
        className={cn(
          'flex flex-col items-center gap-4',
          card &&
            'editorial-panel paper-stack min-w-[240px] rounded-[1.75rem] px-8 py-10'
        )}
      >
        {content}
      </div>
    </div>
  );
}
