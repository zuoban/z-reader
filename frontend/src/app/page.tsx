'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Headphones,
  LibraryBig,
  Upload,
} from 'lucide-react';
import { AppScreen, BrandMark } from '@/components/AppShell';
import { buttonVariants } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

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

export default function Home() {
  const { isLoading, isAuthenticated } = useAuth();
  const primaryHref = !isLoading && isAuthenticated ? '/shelf' : '/login';
  const primaryLabel = !isLoading && isAuthenticated ? '进入书架' : '开始阅读';

  return (
    <AppScreen className="overflow-x-hidden">
      {/* Noise Texture Overlay */}
      <div className="pointer-events-none fixed inset-0 z-50 opacity-[0.03] mix-blend-multiply" 
           style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} 
      />

      <main className="min-h-screen bg-[#FCFBF9] text-[#1A1A1A] transition-colors duration-500">
        {/* Navigation */}
        <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-8 md:px-12">
          <BrandMark size="sm" priority />
          <div className="flex items-center gap-6">
            <Link
              href="/login"
              className="text-sm font-medium hover:text-primary transition-colors hidden sm:block"
            >
              登录
            </Link>
            <Link
              href={primaryHref}
              className={cn(
                buttonVariants({ variant: 'outline' }),
                "rounded-full border-[#1A1A1A] px-6 text-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-[#FCFBF9]"
              )}
            >
              {primaryLabel}
            </Link>
          </div>
        </header>

        {/* Hero Section */}
        <section className="mx-auto flex max-w-7xl flex-col px-6 pt-12 pb-24 md:px-12 lg:flex-row lg:items-center lg:pt-20">
          <div className="flex-1 lg:pr-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground mb-8">
              <span className="flex h-1.5 w-1.5 rounded-full bg-primary" />
              私人多格式电子书阅读器
            </div>
            <h1 className="font-heading text-5xl font-medium leading-[1.1] tracking-tight sm:text-7xl lg:text-8xl">
              安静地，<br />
              放下一本书。
            </h1>
            <p className="mt-10 max-w-xl text-lg leading-relaxed text-[#4A4A4A] sm:text-xl">
              Z Reader 是一个面向个人书架的阅读空间。把不同格式的电子书放进同一个干净的平面。阅读、续读、分类和语音伴读都围绕长时间阅读展开。
            </p>
            <div className="mt-12 flex flex-col gap-4 sm:flex-row">
              <Link
                href={primaryHref}
                className={cn(
                  buttonVariants({ size: 'lg' }),
                  "h-14 rounded-full bg-[#1A1A1A] px-10 text-[#FCFBF9] hover:bg-[#333333] transition-all duration-300"
                )}
              >
                {primaryLabel}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'lg' }),
                  "h-14 rounded-full border-[#1A1A1A] px-8 text-[#1A1A1A] hover:bg-[#1A1A1A]/5 transition-all duration-300"
                )}
              >
                管理藏书
              </Link>
            </div>
          </div>

          <div className="mt-16 flex-1 lg:mt-0 lg:pl-12 animate-in fade-in zoom-in-95 duration-1000">
            <div className="relative aspect-[4/5] w-full max-w-lg mx-auto md:max-w-none">
              <div className="absolute inset-0 rounded-2xl border border-black/5 bg-white shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)]" />
              <div className="absolute inset-4 overflow-hidden rounded-lg border border-black/5 bg-[#FCFBF9] p-8 md:p-12">
                <div className="mb-12 h-1 w-12 bg-primary/20" />
                <div className="space-y-6">
                  <div className="h-6 w-full bg-[#1A1A1A]/5 rounded" />
                  <div className="h-6 w-[94%] bg-[#1A1A1A]/5 rounded" />
                  <div className="h-6 w-[88%] bg-[#1A1A1A]/5 rounded" />
                  <div className="h-6 w-[92%] bg-[#1A1A1A]/5 rounded" />
                  <div className="h-6 w-[74%] bg-[#1A1A1A]/5 rounded" />
                  <div className="h-6 w-[96%] bg-[#1A1A1A]/5 rounded" />
                  <div className="h-6 w-[82%] bg-[#1A1A1A]/5 rounded" />
                </div>
                <div className="mt-16 flex items-center justify-between border-t border-black/5 pt-8">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-[#1A1A1A]/5" />
                    <div className="space-y-1">
                      <div className="h-3 w-20 bg-[#1A1A1A]/10 rounded" />
                      <div className="h-2 w-12 bg-[#1A1A1A]/5 rounded" />
                    </div>
                  </div>
                  <div className="h-6 w-12 rounded-full border border-black/5" />
                </div>
              </div>
              <div className="absolute -bottom-8 -right-8 hidden h-48 w-40 rounded-xl border border-black/5 bg-white p-4 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.12)] lg:block">
                 <div className="aspect-[3/4] rounded bg-muted/20 mb-3" />
                 <div className="h-2 w-16 bg-[#1A1A1A]/10 rounded mb-2" />
                 <div className="h-1.5 w-10 bg-[#1A1A1A]/5 rounded" />
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="border-t border-black/5 py-24">
          <div className="mx-auto max-w-7xl px-6 md:px-12">
            <div className="grid gap-12 md:grid-cols-3">
              {featureItems.map((item, idx) => (
                <article 
                  key={item.title} 
                  className={cn(
                    "group animate-in fade-in duration-700 fill-mode-both",
                    idx === 1 && "delay-150",
                    idx === 2 && "delay-300"
                  )}
                >
                  <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/5 text-primary group-hover:scale-110 transition-transform duration-300">
                    <item.icon size={22} strokeWidth={1.5} />
                  </div>
                  <h2 className="font-heading text-2xl font-medium mb-4">{item.title}</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-black/5 py-12">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 md:flex-row md:px-12">
            <div className="flex items-center gap-2">
              <LibraryBig size={18} className="text-primary" />
              <span className="text-sm font-medium">Z Reader</span>
            </div>
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} Z Reader. 一个开源的个人阅读器项目。
            </p>
          </div>
        </footer>
      </main>
    </AppScreen>
  );
}
