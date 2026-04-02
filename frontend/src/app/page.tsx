'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function Home() {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useAuth();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (!isLoading && !hasRedirected.current) {
      hasRedirected.current = true;
      if (isAuthenticated) {
        router.push('/shelf');
      } else {
        router.push('/login');
      }
    }
  }, [isLoading, isAuthenticated, router]);

  return (
    <div className="min-h-screen warm-gradient paper-texture">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-5 py-6 sm:px-7 sm:py-7 lg:px-10 lg:py-9">
        <div className="flex min-w-[220px] flex-col items-center gap-4 rounded-[28px] border border-border/70 bg-background px-8 py-10 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.45)]">
          <Image
            src="/icons/logo-wordmark.svg"
            alt="Z Reader"
            width={180}
            height={55}
            className="h-auto w-[160px]"
            priority
          />
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-foreground/20"
            style={{ borderTopColor: 'var(--foreground)' }}
          />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">正在进入你的阅读空间</p>
            <p className="mt-1 text-xs text-muted-foreground">为你准备书架与阅读进度</p>
          </div>
        </div>
      </div>
    </div>
  );
}
