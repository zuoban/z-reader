'use client';

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const SCROLL_SHOW_THRESHOLD_PX = 480;

export interface ShelfScrollToTopProps {
  hasBatchBar?: boolean;
}

export function ShelfScrollToTop({ hasBatchBar = false }: ShelfScrollToTopProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => {
      setVisible(window.scrollY > SCROLL_SHOW_THRESHOLD_PX);
    };

    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    return () => window.removeEventListener('scroll', updateVisibility);
  }, []);

  if (!visible) return null;

  function handleScrollToTop() {
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({
      top: 0,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }

  return (
    <button
      type="button"
      onClick={handleScrollToTop}
      aria-label="回到顶部"
      title="回到顶部"
      className={cn(
        'paper-reveal-soft fixed right-[max(1.25rem,env(safe-area-inset-right,0px))] z-40 inline-flex size-11 cursor-pointer items-center justify-center rounded-full border border-border bg-[var(--paper-surface-glass)] text-foreground shadow-[var(--paper-shadow-floating)] backdrop-blur-md transition-[background-color,border-color,color,transform,bottom] duration-200 hover:border-primary/35 hover:bg-card hover:text-primary focus-visible:outline-2 focus-visible:outline-ring active:scale-95 motion-reduce:active:scale-100',
        hasBatchBar
          ? 'bottom-[calc(env(safe-area-inset-bottom,0px)+8.75rem)] sm:bottom-[calc(env(safe-area-inset-bottom,0px)+5.25rem)]'
          : 'bottom-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]'
      )}
    >
      <ArrowUp className="size-4" strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
