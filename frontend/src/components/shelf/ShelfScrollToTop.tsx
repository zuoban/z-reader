'use client';

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const SCROLL_SHOW_THRESHOLD_PX = 480;
const RING_RADIUS = 20;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export interface ShelfScrollToTopProps {
  hasBatchBar?: boolean;
}

export function ShelfScrollToTop({ hasBatchBar = false }: ShelfScrollToTopProps) {
  const [visible, setVisible] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const updateScrollState = () => {
      const y = window.scrollY;
      setVisible(y > SCROLL_SHOW_THRESHOLD_PX);
      const maxScroll = Math.max(
        document.documentElement.scrollHeight - window.innerHeight,
        0
      );
      setScrollProgress(
        maxScroll > 0 ? Math.min(Math.max(y / maxScroll, 0), 1) : 0
      );
    };

    updateScrollState();
    window.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState, { passive: true });
    return () => {
      window.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, []);

  if (!visible) return null;

  const progressPercent = Math.round(scrollProgress * 100);
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - scrollProgress);

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
      data-scroll-progress={progressPercent}
      className={cn(
        'paper-reveal-soft fixed right-[max(1.25rem,env(safe-area-inset-right,0px))] z-40 inline-flex size-11 cursor-pointer items-center justify-center rounded-full border border-border bg-[var(--paper-surface-glass)] text-foreground shadow-[var(--paper-shadow-floating)] backdrop-blur-md transition-[background-color,border-color,color,transform,bottom] duration-200 hover:border-primary/35 hover:bg-card hover:text-primary focus-visible:outline-2 focus-visible:outline-ring active:scale-95 motion-reduce:active:scale-100',
        hasBatchBar
          ? 'bottom-[calc(env(safe-area-inset-bottom,0px)+8.75rem)] sm:bottom-[calc(env(safe-area-inset-bottom,0px)+5.25rem)]'
          : 'bottom-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]'
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 44 44"
        fill="none"
        className="pointer-events-none absolute inset-0 h-full w-full text-primary"
      >
        <circle
          cx="22"
          cy="22"
          r={RING_RADIUS}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={strokeDashoffset}
          transform="rotate(-90 22 22)"
        />
      </svg>
      <ArrowUp className="relative z-10 size-4" strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
