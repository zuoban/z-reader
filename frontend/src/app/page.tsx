'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { AppScreen, LoadingState } from '@/components/AppShell';

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
    <AppScreen>
      <LoadingState
        card
        showLogo
        title="正在进入你的阅读空间"
        description="为你准备书架与阅读进度"
      />
    </AppScreen>
  );
}
