'use client';

import Image from 'next/image';
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
    return null;
  }

  if (variant === 'login') {
    return (
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background" />
        <div className="absolute -top-[10%] -left-[10%] h-[40%] w-[40%] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute -bottom-[10%] -right-[10%] h-[40%] w-[40%] rounded-full bg-primary/5 blur-[120px]" />
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
  sm: 'w-[220px]',
  md: 'w-[260px]',
  lg: 'w-[300px]',
};

export function BrandMark({
  size = 'md',
  framed = false,
  className,
  priority = false,
}: BrandMarkProps) {
  const logo = (
    <>
      <Image
        src="/icons/logo-wordmark.svg"
        alt="Z Reader"
        width={216}
        height={66}
        className={cn('h-auto dark:hidden', brandSizes[size])}
        priority={priority}
      />
      <Image
        src="/icons/logo-wordmark-light.svg"
        alt="Z Reader"
        width={216}
        height={66}
        className={cn('hidden h-auto dark:block', brandSizes[size])}
        priority={priority}
      />
    </>
  );

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
