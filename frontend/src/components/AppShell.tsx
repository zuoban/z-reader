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
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden shelf-ambient-bg"
      />
    );
  }

  if (variant === 'login') {
    return (
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-36 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--primary)_12%,transparent),transparent)]" />
        <div className="absolute inset-y-0 right-0 w-1/3 bg-[linear-gradient(270deg,color-mix(in_srgb,var(--accent)_8%,transparent),transparent)]" />
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
    <div className={cn('relative min-h-screen overflow-hidden paper-texture', className)}>
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
        'rounded-lg border border-border/70 bg-background px-4 py-3 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.35)]',
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
      className={cn('h-10 w-10 animate-spin rounded-full border-2 border-foreground/20', className)}
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
            'min-w-[220px] rounded-lg border border-border/70 bg-background/95 px-8 py-10 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.45)] backdrop-blur-sm'
        )}
      >
        {content}
      </div>
    </div>
  );
}
