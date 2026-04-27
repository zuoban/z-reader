'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Headphones,
  LibraryBig,
  Moon,
  PanelLeft,
  Search,
  Sparkles,
  Upload,
} from 'lucide-react';
import { AppScreen, BrandMark } from '@/components/AppShell';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

const readingStats = [
  { label: '本地书籍', value: '128' },
  { label: '阅读进度', value: '92%' },
  { label: '语音续读', value: 'TTS' },
];

const features = [
  {
    icon: Upload,
    title: '拖入即读',
    description: '上传常见电子书文件后自动归档到私人书架，封面、进度和分类保持同步。',
  },
  {
    icon: Headphones,
    title: '语音伴读',
    description: '朗读控制、语音选择和前台续播，让长文也能自然流动。',
  },
  {
    icon: Moon,
    title: '沉浸主题',
    description: '亮暗主题、阅读控制和移动端手势都围绕长时间阅读打磨。',
  },
];

const shelfBooks = [
  ['雾中图书馆', 'from-primary/75', 'to-cyan-400/60'],
  ['夜航札记', 'from-emerald-500/70', 'to-primary/55'],
  ['纸页宇宙', 'from-amber-400/75', 'to-rose-400/60'],
];

export default function Home() {
  const { isLoading, isAuthenticated } = useAuth();
  const primaryHref = !isLoading && isAuthenticated ? '/shelf' : '/login';
  const primaryLabel = !isLoading && isAuthenticated ? '进入我的书架' : '开始阅读';

  return (
    <AppScreen className="overflow-x-hidden">
      <main className="relative min-h-screen">
        <section className="relative isolate overflow-hidden px-5 pb-10 pt-5 sm:px-7 lg:px-10">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 -z-10 h-[72vh] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--primary)_10%,transparent),transparent_64%)]"
          />
          <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-7xl flex-col">
            <header className="flex items-center justify-between gap-4 py-3">
              <BrandMark size="sm" priority />
              <nav className="hidden items-center gap-1 rounded-full border border-border/70 bg-card/70 p-1 shadow-[0_14px_34px_-28px_var(--paper-shadow)] backdrop-blur sm:flex">
                <a
                  href="#reader"
                  className="rounded-full px-4 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted/70 hover:text-foreground"
                >
                  阅读器
                </a>
                <a
                  href="#features"
                  className="rounded-full px-4 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted/70 hover:text-foreground"
                >
                  功能
                </a>
                <a
                  href="#shelf"
                  className="rounded-full px-4 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted/70 hover:text-foreground"
                >
                  书架
                </a>
              </nav>
              <Link
                href={primaryHref}
                className={cn(
                  buttonVariants({ size: 'lg' }),
                  'h-10 rounded-full px-4 text-xs font-semibold sm:px-5'
                )}
              >
                {primaryLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </header>

            <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[0.92fr_1.08fr] lg:gap-14 lg:py-12">
              <div className="max-w-3xl">
                <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/70 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-[0_12px_24px_-22px_var(--paper-shadow)] backdrop-blur">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  私人电子书阅读空间
                </div>
                <h1 className="font-heading text-[clamp(3.1rem,8vw,7.4rem)] font-semibold leading-[0.92] tracking-normal text-foreground">
                  把书架
                  <span className="block text-primary">带进浏览器。</span>
                </h1>
                <p className="mt-7 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
                  Z Reader 为你的数字藏书准备了一个安静、快速、可续读的阅读室。
                  导入、整理、朗读、回到上次停下的那一页，都在同一个干净界面里完成。
                </p>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href={primaryHref}
                    className={cn(
                      buttonVariants({ size: 'lg' }),
                      'h-12 rounded-2xl px-6 text-sm font-semibold shadow-[0_26px_42px_-26px_var(--paper-shadow)]'
                    )}
                  >
                    {primaryLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/login"
                    className={cn(
                      buttonVariants({ variant: 'outline', size: 'lg' }),
                      'h-12 rounded-2xl px-6 text-sm font-semibold'
                    )}
                  >
                    登录账户
                  </Link>
                </div>
              </div>

              <div id="reader" className="relative min-h-[520px] lg:min-h-[620px]">
                <div className="absolute left-0 top-8 hidden h-28 w-28 rounded-[2rem] border border-border/60 bg-card/70 shadow-[0_30px_52px_-38px_var(--paper-shadow)] backdrop-blur md:block" />
                <div className="absolute bottom-6 right-2 hidden h-20 w-40 rotate-[-4deg] rounded-[1.5rem] border border-border/60 bg-card/70 shadow-[0_30px_52px_-38px_var(--paper-shadow)] backdrop-blur md:block" />

                <div className="editorial-panel paper-stack absolute right-0 top-0 w-[92%] max-w-[640px] overflow-hidden rounded-[2rem] bg-card/95">
                  <div className="editorial-divider flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                    </div>
                    <div className="paper-field flex h-8 w-40 items-center gap-2 rounded-full px-3 text-xs text-muted-foreground">
                      <Search className="h-3.5 w-3.5" />
                      搜索书名
                    </div>
                  </div>
                  <div className="grid min-h-[430px] grid-cols-[74px_1fr] sm:grid-cols-[96px_1fr]">
                    <aside className="border-r border-border/70 bg-muted/35 px-3 py-5">
                      <div className="mx-auto mb-5 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        <LibraryBig className="h-5 w-5" />
                      </div>
                      <div className="space-y-3">
                        {[PanelLeft, BookOpen, Headphones, Moon].map((Icon, index) => (
                          <div
                            key={index}
                            className={cn(
                              'mx-auto flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 text-muted-foreground',
                              index === 1 && 'bg-card text-primary shadow-sm'
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                        ))}
                      </div>
                    </aside>
                    <div className="p-4 sm:p-6">
                      <div className="mb-5 flex items-end justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
                            Reading Now
                          </p>
                          <h2 className="mt-1 font-heading text-2xl font-semibold tracking-normal">
                            纸页宇宙
                          </h2>
                        </div>
                        <div className="hidden rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary sm:block">
                          已读 62%
                        </div>
                      </div>
                      <div className="relative overflow-hidden rounded-[1.5rem] border border-border bg-[linear-gradient(135deg,color-mix(in_srgb,var(--card)_94%,var(--primary)),var(--muted))] p-5 shadow-inner">
                        <div className="absolute right-0 top-0 h-full w-14 border-l border-border/70 bg-card/35" />
                        <div className="relative max-w-[78%] space-y-3">
                          <div className="h-3 w-28 rounded-full bg-foreground/75" />
                          <div className="h-2 w-full rounded-full bg-muted-foreground/24" />
                          <div className="h-2 w-[92%] rounded-full bg-muted-foreground/20" />
                          <div className="h-2 w-[76%] rounded-full bg-muted-foreground/18" />
                          <div className="h-2 w-[88%] rounded-full bg-muted-foreground/20" />
                          <div className="h-2 w-[54%] rounded-full bg-muted-foreground/16" />
                        </div>
                      </div>
                      <div className="mt-5 grid grid-cols-3 gap-3">
                        {readingStats.map((stat) => (
                          <div
                            key={stat.label}
                            className="rounded-2xl border border-border/70 bg-card/70 px-3 py-3"
                          >
                            <p className="text-lg font-semibold">{stat.value}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">{stat.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  id="shelf"
                  className="paper-panel absolute bottom-0 left-0 w-[76%] max-w-[430px] rotate-[-2deg] rounded-[1.75rem] p-4 shadow-[0_36px_64px_-44px_var(--paper-shadow)]"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                      Shelf
                    </p>
                    <div className="h-2 w-16 rounded-full bg-primary/30" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {shelfBooks.map(([title, from, to]) => (
                      <div key={title} className="min-w-0">
                        <div
                          className={cn(
                            'aspect-[3/4] rounded-xl bg-gradient-to-br shadow-[0_18px_28px_-22px_var(--paper-shadow)]',
                            from,
                            to
                          )}
                        />
                        <p className="mt-2 truncate text-xs font-medium">{title}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="features"
          className="border-t border-border/70 bg-card/55 px-5 py-10 backdrop-blur sm:px-7 lg:px-10"
        >
          <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="group rounded-[1.5rem] border border-border/70 bg-background/60 p-5 transition duration-300 hover:-translate-y-1 hover:bg-card"
              >
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="font-heading text-xl font-semibold tracking-normal">{feature.title}</h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </AppScreen>
  );
}
