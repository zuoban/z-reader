'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  Check,
  ChevronRight,
  Headphones,
  LibraryBig,
  ListTree,
  Moon,
  PanelLeft,
  Search,
  SlidersHorizontal,
  Sparkles,
  Upload,
} from 'lucide-react';
import { AppScreen, BrandMark } from '@/components/AppShell';
import { buttonVariants } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '#reader', label: '阅读体验' },
  { href: '#workflow', label: '整理流程' },
  { href: '#features', label: '核心能力' },
];

const heroStats = [
  { label: '本地优先', value: 'EPUB' },
  { label: '续读进度', value: '92%' },
  { label: '听书模式', value: 'TTS' },
];

const workflowSteps = [
  {
    icon: Upload,
    title: '导入藏书',
    description: '上传电子书后自动进入私人书架，封面、分类和阅读状态统一管理。',
  },
  {
    icon: ListTree,
    title: '整理阅读线索',
    description: '用分类、搜索和最近阅读快速回到目标书籍，不必在文件夹里反复找。',
  },
  {
    icon: BookOpen,
    title: '继续上次阅读',
    description: '阅读器会记住进度，桌面与移动端都能直接回到停下的位置。',
  },
];

const features = [
  {
    icon: Headphones,
    title: '语音伴读',
    description: '朗读控制、语音选择和前台续播，让长章节可以在通勤或整理资料时继续。',
  },
  {
    icon: SlidersHorizontal,
    title: '阅读细节可调',
    description: '字体、字号、行高、主题和翻页模式都围绕长时间阅读做成可控参数。',
  },
  {
    icon: Moon,
    title: '舒适主题',
    description: '亮色、暗色和护眼色会同步影响书架与阅读器，减少界面切换的割裂感。',
  },
];

const bookSpines = [
  { title: '雾中图书馆', className: 'from-primary/80 to-cyan-400/65' },
  { title: '夜航札记', className: 'from-emerald-500/75 to-primary/60' },
  { title: '纸页宇宙', className: 'from-amber-400/80 to-rose-400/65' },
  { title: '时间的页脚', className: 'from-violet-500/75 to-sky-400/65' },
];

const readerLines = ['w-full', 'w-[94%]', 'w-[78%]', 'w-[88%]', 'w-[64%]'];

export default function Home() {
  const { isLoading, isAuthenticated } = useAuth();
  const primaryHref = !isLoading && isAuthenticated ? '/shelf' : '/login';
  const primaryLabel = !isLoading && isAuthenticated ? '进入我的书架' : '开始阅读';

  return (
    <AppScreen className="overflow-x-hidden">
      <main className="relative min-h-screen">
        <section className="relative isolate px-5 pb-8 pt-5 sm:px-7 lg:px-10">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 -z-10 h-[68dvh] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--primary)_11%,transparent),transparent_68%)]"
          />

          <div className="mx-auto flex w-full max-w-7xl flex-col">
            <header className="flex items-center justify-between gap-4 py-3">
              <BrandMark size="sm" priority />
              <nav
                aria-label="首页导航"
                className="hidden items-center gap-1 rounded-full border border-border/70 bg-card/72 p-1 shadow-[0_14px_34px_-28px_var(--paper-shadow)] backdrop-blur md:flex"
              >
                {navItems.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="rounded-full px-4 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
                  >
                    {item.label}
                  </a>
                ))}
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

            <div className="grid items-center gap-10 py-8 lg:grid-cols-[0.88fr_1.12fr] lg:gap-14 lg:py-10">
              <div className="max-w-3xl">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/72 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-[0_12px_24px_-22px_var(--paper-shadow)] backdrop-blur">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  私人电子书阅读空间
                </div>
                <h1 className="font-heading text-[clamp(3.2rem,8vw,7rem)] font-semibold leading-[0.92] tracking-normal text-foreground">
                  Z Reader
                </h1>
                <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
                  一个安静、快速、可续读的浏览器阅读室。把电子书导入书架，
                  用舒适主题阅读，需要时切到语音伴读，再从上次停下的位置继续。
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
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
                  <a
                    href="#reader"
                    className={cn(
                      buttonVariants({ variant: 'outline', size: 'lg' }),
                      'h-12 rounded-2xl px-6 text-sm font-semibold'
                    )}
                  >
                    查看阅读体验
                    <ChevronRight className="h-4 w-4" />
                  </a>
                </div>

                <dl className="mt-9 hidden max-w-xl grid-cols-3 gap-3 sm:grid">
                  {heroStats.map((stat) => (
                    <div
                      key={stat.label}
                      className="paper-panel-soft rounded-2xl px-3 py-3"
                    >
                      <dt className="text-[11px] text-muted-foreground">{stat.label}</dt>
                      <dd className="mt-1 text-lg font-semibold text-foreground">{stat.value}</dd>
                    </div>
                  ))}
                </dl>

                <div id="reader" className="editorial-panel mt-7 overflow-hidden rounded-[1.5rem] sm:hidden">
                  <div className="editorial-divider flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                    </div>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                      已读 62%
                    </span>
                  </div>
                  <div className="grid grid-cols-[60px_1fr]">
                    <aside className="border-r border-border/70 bg-muted/35 px-3 py-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        <LibraryBig className="h-5 w-5" />
                      </div>
                    </aside>
                    <div className="p-3.5">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        Reading Now
                      </p>
                      <h2 className="mt-1 font-heading text-xl font-semibold tracking-normal">
                        纸页宇宙
                      </h2>
                      <div className="mt-3 space-y-1.5 rounded-2xl border border-border bg-muted/45 p-3">
                        <div className="h-2.5 w-24 rounded-full bg-foreground/75" />
                        {readerLines.slice(0, 3).map((width) => (
                          <div
                            key={width}
                            className={cn('h-2 rounded-full bg-muted-foreground/20', width)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative hidden min-h-[560px] sm:block lg:min-h-[600px]">
                <div className="editorial-panel paper-stack absolute right-0 top-0 w-full max-w-[670px] overflow-hidden rounded-[2rem] bg-card/95">
                  <div className="editorial-divider flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                    </div>
                    <div className="paper-field hidden h-8 w-44 items-center gap-2 rounded-full px-3 text-xs text-muted-foreground sm:flex">
                      <Search className="h-3.5 w-3.5" />
                      搜索书名、作者
                    </div>
                  </div>

                  <div className="grid min-h-[468px] grid-cols-[76px_1fr] sm:grid-cols-[100px_1fr]">
                    <aside className="border-r border-border/70 bg-muted/35 px-3 py-5">
                      <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_18px_26px_-20px_var(--paper-shadow)]">
                        <LibraryBig className="h-5 w-5" />
                      </div>
                      <div className="space-y-3">
                        {[PanelLeft, BookMarked, Headphones, Moon].map((Icon, index) => (
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
                          <p className="text-xs font-semibold uppercase text-muted-foreground">
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

                      <div className="grid gap-4 lg:grid-cols-[1fr_180px]">
                        <div className="relative overflow-hidden rounded-[1.5rem] border border-border bg-[linear-gradient(135deg,color-mix(in_srgb,var(--card)_94%,var(--primary)),var(--muted))] p-5 shadow-inner">
                          <div className="absolute right-0 top-0 h-full w-14 border-l border-border/70 bg-card/35" />
                          <div className="relative max-w-[82%] space-y-3">
                            <div className="h-3 w-28 rounded-full bg-foreground/75" />
                            {readerLines.map((width) => (
                              <div
                                key={width}
                                className={cn('h-2 rounded-full bg-muted-foreground/20', width)}
                              />
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 lg:grid-cols-1">
                          {heroStats.map((stat) => (
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
                </div>

                <div className="paper-panel absolute bottom-4 left-0 w-[82%] max-w-[470px] rotate-[-2deg] rounded-[1.75rem] p-4 shadow-[0_36px_64px_-44px_var(--paper-shadow)]">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      Shelf Preview
                    </p>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                      4 本在读
                      <Check className="h-3.5 w-3.5" />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {bookSpines.map((book) => (
                      <div key={book.title} className="min-w-0">
                        <div
                          className={cn(
                            'aspect-[3/4] rounded-xl bg-gradient-to-br shadow-[0_18px_28px_-22px_var(--paper-shadow)]',
                            book.className
                          )}
                        />
                        <p className="mt-2 truncate text-xs font-medium">{book.title}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="workflow" className="border-y border-border/70 bg-card/58 px-5 py-6 sm:px-7 sm:py-12 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <p className="text-xs font-semibold uppercase text-primary">Workflow</p>
                <h2 className="mt-2 font-heading text-3xl font-semibold tracking-normal sm:text-4xl">
                  从导入到续读，路径尽量短。
                </h2>
              </div>
              <p className="max-w-xl text-sm leading-7 text-muted-foreground">
                落地页直接呈现核心读书流程，而不是把用户带进一堆说明文字里。
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {workflowSteps.map((step, index) => (
                <article
                  key={step.title}
                  className="paper-panel-soft rounded-[1.5rem] p-5"
                >
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <step.icon className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="font-heading text-xl font-semibold tracking-normal">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    {step.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="px-5 py-12 sm:px-7 lg:px-10">
          <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="group rounded-[1.5rem] border border-border/70 bg-background/60 p-5 transition duration-300 hover:-translate-y-1 hover:bg-card"
              >
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="font-heading text-xl font-semibold tracking-normal">
                  {feature.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </AppScreen>
  );
}
