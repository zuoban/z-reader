'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Bookmark, Cloud, Palette, Server, Smartphone, Upload } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AppScreen, BrandGlyph, BrandLogo } from '@/components/AppShell';

const previewBooks = [
  { title: '《西游记》', meta: '54% · 1分钟前', tone: 'from-[#8f7d52] to-[#5c4e32]' },
  { title: '《水浒传》', meta: '1% · 25分钟前', tone: 'from-[#8a7054] to-[#5a4634]' },
  { title: '《三国演义》', meta: '未开始', tone: 'from-[#6a8574] to-[#3f5248]' },
];

export default function LandingPage() {
  const { isLoading, isAuthenticated } = useAuth({ redirectOnExpire: false });
  const primaryHref = !isLoading && isAuthenticated ? '/shelf' : '/login?mode=register';

  return (
    <AppScreen
      ambient="shelf"
      className="bg-background text-foreground"
      contentClassName="flex min-h-dvh flex-col"
    >
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-6 sm:px-7 lg:px-10">
        <BrandLogo compact />
        <nav>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-xl border border-transparent px-3.5 text-sm font-semibold text-foreground/80 transition-all hover:border-border/60 hover:bg-card/70 hover:text-foreground"
          >
            {!isLoading && isAuthenticated ? '进入书架' : '登录'}
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto flex max-w-7xl flex-col items-center px-5 pb-12 pt-10 text-center sm:px-7 sm:pb-16 sm:pt-16 lg:px-10 lg:pt-20">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/65 bg-card/80 px-3.5 py-2 text-[12px] font-semibold text-muted-foreground shadow-[0_12px_30px_-26px_var(--paper-shadow),inset_0_1px_0_color-mix(in_srgb,var(--glass-specular)_50%,transparent)]">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            私有书库 · 多端续读 · 沉浸阅读
          </div>
          <h1 className="mx-auto max-w-4xl font-heading text-5xl font-semibold leading-[1.05] tracking-[-0.03em] text-foreground sm:text-6xl lg:text-7xl">
            Z Reader
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-[17px] leading-8 text-muted-foreground sm:text-xl sm:leading-9">
            把 EPUB、MOBI、AZW3 和 PDF 收进自己的书架，在干净安静的界面里继续每一次阅读。
          </p>
          <div className="mt-8 flex w-full max-w-sm flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row sm:items-center sm:justify-center">
            <Link
              href={primaryHref}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-8 text-base font-semibold text-primary-foreground shadow-[0_14px_32px_-18px_var(--paper-shadow)] transition-all hover:opacity-92 active:scale-[0.98]"
            >
              {!isLoading && isAuthenticated ? '回到我的书架' : '创建我的书库'}
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border/70 bg-card/80 px-8 text-base font-semibold text-foreground shadow-[inset_0_1px_0_color-mix(in_srgb,var(--glass-specular)_45%,transparent)] transition-all hover:bg-secondary/80 active:scale-[0.98]"
            >
              登录
            </Link>
          </div>

          <ProductPreview />
        </section>

        <section className="border-t border-border/55 bg-card/40 py-14 sm:py-18">
          <div className="mx-auto max-w-7xl px-5 sm:px-7 lg:px-10">
            <div className="max-w-2xl">
              <h2 className="font-heading text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-4xl">
                阅读工具该安静，但不能粗糙
              </h2>
              <p className="mt-3 text-base leading-7 text-muted-foreground">
                书架、同步、分类和阅读设置都围绕一个目标：让你少管理一点，多读一点。
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
              <FeatureItem
                icon={<Upload size={19} />}
                title="集中导入"
                description="批量上传并整理你的电子书收藏。"
              />
              <FeatureItem
                icon={<Cloud size={19} />}
                title="进度同步"
                description="跨设备保存阅读位置，随时续读。"
              />
              <FeatureItem
                icon={<Palette size={19} />}
                title="阅读主题"
                description="按环境切换浅色、深色、护眼和字体偏好。"
              />
              <FeatureItem
                icon={<Bookmark size={19} />}
                title="书签回看"
                description="标记关键段落，回到重要章节不费力。"
              />
              <FeatureItem
                icon={<Smartphone size={19} />}
                title="触控友好"
                description="手机、平板和桌面都有稳定的操作尺寸。"
              />
              <FeatureItem
                icon={<Server size={19} />}
                title="自托管"
                description="书库数据留在自己的服务里。"
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/55 bg-card/25 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 text-sm text-muted-foreground sm:px-7 md:flex-row lg:px-10">
          <div className="flex items-center gap-2.5">
            <BrandGlyph className="h-5 w-5 opacity-85" />
            <span className="font-medium text-foreground/75">Z Reader · 安静的私有书库</span>
          </div>
          <div className="flex items-center gap-3 text-[13px]">
            <span>开源</span>
            <span className="h-1 w-1 rounded-full bg-border" aria-hidden="true" />
            <span>自托管</span>
            <span className="h-1 w-1 rounded-full bg-border" aria-hidden="true" />
            <span>隐私保护</span>
          </div>
        </div>
      </footer>
    </AppScreen>
  );
}

function ProductPreview() {
  return (
    <div className="mt-12 w-full max-w-5xl overflow-hidden rounded-2xl border border-border/65 bg-card/88 p-2 shadow-[0_28px_70px_-48px_var(--paper-shadow),inset_0_1px_0_color-mix(in_srgb,var(--glass-specular)_52%,transparent)] backdrop-blur">
      <div className="rounded-xl border border-border/50 bg-background/90">
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-border" />
            <span className="h-2 w-2 rounded-full bg-border" />
            <span className="h-2 w-2 rounded-full bg-border" />
          </div>
          <span className="text-[12px] font-semibold text-muted-foreground">我的书架</span>
        </div>
        <div className="grid gap-5 p-5 text-left sm:grid-cols-[1fr_16rem] sm:p-7">
          <div className="grid grid-cols-3 gap-3">
            {previewBooks.map((book) => (
              <div
                key={book.title}
                className="overflow-hidden rounded-xl border border-border/45 bg-card shadow-[0_14px_34px_-30px_var(--paper-shadow)]"
              >
                <div className={`aspect-[3/4] bg-gradient-to-br ${book.tone} p-3`}>
                  <div className="inline-flex rounded-full border border-white/15 bg-black/20 px-2 py-1 text-[10px] font-bold text-white/95 shadow-sm backdrop-blur-sm">
                    书籍
                  </div>
                </div>
                <div className="p-3">
                  <p className="line-clamp-2 text-[13px] font-semibold leading-snug">{book.title}</p>
                  <p className="mt-2 text-[11px] font-medium text-muted-foreground">{book.meta}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col justify-center rounded-xl border border-border/35 bg-shelf-surface-soft p-5">
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Reading Now
            </p>
            <p className="mt-3 font-heading text-2xl font-semibold leading-tight tracking-[-0.02em]">
              从书架到阅读器，界面保持同一种安静的纸感。
            </p>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-background/80">
              <div className="h-full w-[54%] rounded-full bg-primary" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-border/55 bg-background/75 p-5 shadow-[0_12px_32px_-30px_var(--paper-shadow),inset_0_1px_0_color-mix(in_srgb,var(--glass-specular)_40%,transparent)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-[0_18px_40px_-32px_var(--paper-shadow)]">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-border/40 bg-secondary/90 text-foreground">
        {icon}
      </div>
      <h3 className="text-lg font-semibold tracking-[-0.01em] text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}
