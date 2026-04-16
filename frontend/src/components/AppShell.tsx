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
        <div className="absolute left-1/2 top-20 h-44 w-44 -translate-x-1/2 rounded-full bg-accent/[0.06] blur-3xl" />
        <div className="absolute left-10 top-1/3 h-24 w-24 rounded-full bg-foreground/[0.04] blur-3xl" />
        <div className="absolute bottom-16 right-12 h-32 w-32 rounded-full bg-accent/[0.04] blur-3xl" />
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
    <div className={cn('relative min-h-screen overflow-hidden warm-gradient paper-texture', className)}>
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
        'rounded-2xl border border-border/70 bg-background px-4 py-3 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.35)]',
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
            'min-w-[220px] rounded-2xl border border-border/70 bg-background/95 px-8 py-10 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.45)] backdrop-blur-sm'
        )}
      >
        {content}
      </div>
    </div>
  );
}
