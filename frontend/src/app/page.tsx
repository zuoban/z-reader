'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Headphones,
  LibraryBig,
  Moon,
  Search,
  Upload,
} from 'lucide-react';
import { AppScreen, BrandMark } from '@/components/AppShell';
import { buttonVariants } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const shelfBooks = [
  {
    title: '自控力',
    author: '凯利・麦格尼格尔',
    accent: 'bg-[linear-gradient(150deg,#f8fafc_0%,#e8edf4_48%,#c4cad4_100%)]',
    label: '13.3%',
  },
  {
    title: '写作是门手艺',
    author: '刘军强',
    accent: 'bg-[linear-gradient(150deg,#f5f0df_0%,#e2d9bd_50%,#8fa45b_100%)]',
    label: '40.8%',
  },
  {
    title: '图解 HTTP',
    author: '上野宣',
    accent: 'bg-[linear-gradient(150deg,#eef0ff_0%,#dce2ff_55%,#b8c5ff_100%)]',
    label: '1.2%',
  },
];

const featureItems = [
  {
    icon: Upload,
    title: '导入即归档',
    description: '支持 EPUB、MOBI、AZW3、PDF，封面、分类和进度留在同一个书架。',
  },
  {
    icon: BookOpen,
    title: '回到上一页',
    description: '阅读进度自动保存，打开书籍后继续停下的位置。',
  },
  {
    icon: Headphones,
    title: '听读切换',
    description: '需要离开屏幕时，用语音伴读接住长章节。',
  },
];

const readerLines = ['w-full', 'w-[92%]', 'w-[74%]', 'w-[86%]', 'w-[62%]'];

export default function Home() {
  const { isLoading, isAuthenticated } = useAuth();
  const primaryHref = !isLoading && isAuthenticated ? '/shelf' : '/login';
  const primaryLabel = !isLoading && isAuthenticated ? '进入书架' : '开始阅读';

  return (
    <AppScreen className="overflow-x-hidden">
      <main className="min-h-screen bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,#edf2ff)_0%,var(--background)_54%,color-mix(in_srgb,var(--background)_88%,#eef8f4)_100%)]">
        <section className="relative isolate min-h-[92svh] overflow-hidden px-5 pb-14 pt-5 sm:px-8 lg:px-10">
          <div className="absolute inset-0 -z-10">
            <div className="absolute inset-x-0 top-0 h-[72%] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--primary)_12%,transparent)_0%,transparent_78%)]" />
            <div className="absolute left-1/2 top-[48%] h-[34rem] w-[min(86rem,118vw)] -translate-x-1/2 -translate-y-1/2 rounded-[2rem] border border-border/55 bg-card/58 shadow-[0_38px_90px_-64px_var(--paper-shadow)]" />
            <div className="absolute left-[56%] top-[47%] h-[28rem] w-[min(74rem,102vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[1.25rem] border border-primary/14 bg-background/84 shadow-[0_24px_64px_-50px_var(--paper-shadow)]">
              <div className="flex h-12 items-center justify-between border-b border-border/70 px-4">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ef6f61]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#e5bd4d]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#4cae7b]" />
                </div>
                <div className="hidden h-7 w-52 items-center gap-2 rounded-lg border border-border/70 bg-card/80 px-3 text-xs text-muted-foreground sm:flex">
                  <Search className="h-3.5 w-3.5" />
                  搜索书名、作者
                </div>
              </div>
              <div className="grid h-[calc(100%-3rem)] grid-cols-[4.5rem_1fr]">
                <aside className="border-r border-border/70 bg-muted/35 px-3 py-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <LibraryBig className="h-5 w-5" />
                  </div>
                  <div className="mt-5 space-y-3">
                    {[BookOpen, Headphones, Moon].map((Icon, index) => (
                      <div
                        key={index}
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 text-muted-foreground',
                          index === 0 && 'bg-card text-primary'
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                    ))}
                  </div>
                </aside>
                <div className="grid grid-cols-2 gap-5 p-5 opacity-70 sm:grid-cols-[1.15fr_0.85fr]">
                  <div className="rounded-xl border border-border/70 bg-card/72 p-5">
                    <div className="mb-5 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-primary">Reading Now</p>
                        <p className="mt-1 font-heading text-2xl font-semibold">纸页宇宙</p>
                      </div>
                      <span className="rounded-lg bg-[#e7f5ec] px-2.5 py-1 text-xs font-semibold text-[#2f7b55]">
                        62%
                      </span>
                    </div>
                    <div className="space-y-3 rounded-lg border border-border/70 bg-muted/35 p-5">
                      {readerLines.map((width) => (
                        <div
                          key={width}
                          className={cn('h-2 rounded-full bg-foreground/18', width)}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="hidden grid-cols-3 gap-3 sm:grid">
                    {shelfBooks.map((book) => (
                      <div key={book.title} className="min-w-0 rounded-xl border border-border/70 bg-card/72 p-3">
                        <div className={cn('aspect-[3/4] rounded-lg shadow-[0_20px_30px_-24px_var(--paper-shadow)]', book.accent)} />
                        <p className="mt-3 truncate text-sm font-semibold">{book.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{book.author}</p>
                        <p className="mt-2 text-xs font-semibold text-primary">{book.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute inset-y-0 left-0 w-[68%] bg-[linear-gradient(90deg,var(--background)_0%,color-mix(in_srgb,var(--background)_92%,transparent)_64%,transparent_100%)]" />
          </div>

          <div className="mx-auto flex min-h-[calc(92svh-3rem)] w-full max-w-7xl flex-col">
            <header className="flex items-center justify-between gap-4">
              <BrandMark size="sm" priority />
              <Link
                href={primaryHref}
                className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-10 rounded-lg px-4')}
              >
                {primaryLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </header>

            <div className="flex flex-1 items-center py-16">
              <div className="max-w-3xl">
                <p className="mb-5 inline-flex rounded-lg border border-border/70 bg-card/78 px-3 py-1.5 text-xs font-semibold text-primary shadow-[0_12px_26px_-22px_var(--paper-shadow)]">
                  私人多格式电子书阅读器
                </p>
                <h1 className="font-heading text-5xl font-semibold leading-none text-foreground sm:text-7xl lg:text-[5.75rem]">
                  Z Reader
                </h1>
                <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
                  把不同格式的电子书放进一个安静的书架。阅读、续读、分类和语音伴读都围绕长时间阅读展开。
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href={primaryHref}
                    className={cn(buttonVariants({ size: 'lg' }), 'h-12 rounded-lg px-6 text-sm font-semibold')}
                  >
                    {primaryLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/login"
                    className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-12 rounded-lg px-6 text-sm font-semibold')}
                  >
                    管理藏书
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 pb-8 sm:px-8 lg:px-10">
          <div className="mx-auto grid max-w-7xl gap-3 md:grid-cols-3">
            {featureItems.map((item) => (
              <article
                key={item.title}
                className="rounded-xl border border-border/70 bg-card/72 p-5 shadow-[0_18px_48px_-42px_var(--paper-shadow)]"
              >
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <item.icon className="h-5 w-5" />
                </div>
                <h2 className="font-heading text-xl font-semibold">{item.title}</h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </AppScreen>
  );
}
