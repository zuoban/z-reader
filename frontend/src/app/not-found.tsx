import Link from 'next/link';
import { ArrowLeft, BookOpen, Home } from 'lucide-react';
import { AppScreen, BrandLogo } from '@/components/AppShell';

export default function NotFound() {
  return (
    <AppScreen contentClassName="flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-[var(--paper-surface-glass)] backdrop-blur-md">
        <div className="app-container flex h-16 items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <BrandLogo compact />
          </Link>
          <Link href="/shelf" className="app-secondary-link !min-h-9 rounded-full px-4">
            进入书架
          </Link>
        </div>
      </header>

      <main className="app-container flex flex-1 items-center justify-center py-12">
        <section className="paper-panel w-full max-w-lg rounded-3xl px-6 py-10 text-center sm:px-10 sm:py-12">
          <div
            aria-hidden="true"
            className="app-sheet-icon mx-auto flex size-14 items-center justify-center rounded-2xl border border-primary/15"
          >
            <BookOpen className="size-6" strokeWidth={1.6} />
          </div>
          <p className="mt-5 font-heading text-5xl font-normal tracking-tight text-primary sm:text-6xl">
            404
          </p>
          <h1 className="mt-3 font-heading text-2xl font-normal leading-tight text-foreground sm:text-3xl">
            这一页暂未找到
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-pretty text-sm leading-6 text-muted-foreground">
            链接可能已失效，或该页面已移至别处。你可以回到书架继续未读的书页。
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href="/shelf" className="app-primary-link">
              <Home className="size-4" strokeWidth={1.6} aria-hidden="true" />
              <span>前往我的书架</span>
            </Link>
            <Link href="/" className="app-secondary-link">
              <ArrowLeft className="size-4" strokeWidth={1.6} aria-hidden="true" />
              <span>返回首页</span>
            </Link>
          </div>
        </section>
      </main>
    </AppScreen>
  );
}
