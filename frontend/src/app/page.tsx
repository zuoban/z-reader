'use client';

import Link from 'next/link';
import { AppScreen, BrandMark } from '@/components/AppShell';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { MoveRight, Library, RefreshCw, Headphones, LayoutGrid, ArrowDown } from 'lucide-react';

// ─── Decorative Ornament Component ───
function Ornament({ className }: { className?: string }) {
  return (
    <svg className={cn('opacity-20', className)} width="120" height="8" viewBox="0 0 120 8" fill="none">
      <line x1="0" y1="4" x2="45" y2="4" stroke="currentColor" strokeWidth="0.5" />
      <circle cx="60" cy="4" r="2" fill="currentColor" />
      <line x1="75" y1="4" x2="120" y2="4" stroke="currentColor" strokeWidth="0.5" />
    </svg>
  );
}

// ─── GitHub Icon ───
function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7a3.37 3.37 0 0 0-.94 2.58V22"></path>
    </svg>
  );
}

// ─── Section Number Badge ───
function SectionNumber({ number, label }: { number: string; label: string }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <span className="font-mono text-[10px] font-bold tracking-[0.25em] text-primary/70 uppercase">
        {number}
      </span>
      <span className="h-px w-12 bg-primary/20" />
      <span className="font-mono text-[10px] font-bold tracking-[0.25em] text-muted-foreground/50 uppercase">
        {label}
      </span>
    </div>
  );
}

// ─── Simulated Device Mockups ───
function DesktopMock({ active }: { active: boolean }) {
  return (
    <div className={cn(
      "w-full h-full transition-all duration-700",
      active ? "opacity-100" : "opacity-0"
    )}>
      <div className="relative w-full h-full bg-[#1a1a1e] rounded-xl overflow-hidden border border-white/10 shadow-2xl">
        {/* Browser Chrome */}
        <div className="h-8 bg-[#2a2a2e] flex items-center px-3 gap-2 border-b border-white/5">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
          </div>
          <div className="flex-1 mx-4">
            <div className="h-5 bg-[#1a1a1e] rounded-md flex items-center px-3">
              <span className="text-[9px] text-white/30 font-mono">localhost:3000/read/book-id</span>
            </div>
          </div>
        </div>
        {/* Reader Content */}
        <div className="flex h-[calc(100%-2rem)]">
          {/* Sidebar */}
          <div className="w-48 bg-[#222226] border-r border-white/5 p-4 hidden sm:block">
            <div className="h-3 w-20 bg-white/10 rounded mb-4" />
            <div className="space-y-2">
              <div className="h-2 w-full bg-white/5 rounded" />
              <div className="h-2 w-4/5 bg-white/5 rounded" />
              <div className="h-2 w-full bg-white/5 rounded" />
              <div className="h-2 w-3/4 bg-white/5 rounded" />
            </div>
          </div>
          {/* Main Content */}
          <div className="flex-1 bg-white p-8 sm:p-12">
            <div className="max-w-sm mx-auto space-y-4">
              <div className="h-3 w-24 bg-primary/20 rounded" />
              <div className="h-5 w-3/4 bg-foreground/80 rounded" />
              <div className="pt-4 space-y-2">
                <div className="h-2 w-full bg-foreground/20 rounded" />
                <div className="h-2 w-full bg-foreground/20 rounded" />
                <div className="h-2 w-5/6 bg-foreground/20 rounded" />
                <div className="h-2 w-full bg-foreground/20 rounded" />
                <div className="h-2 w-4/5 bg-foreground/20 rounded" />
              </div>
              <div className="pt-4 space-y-2">
                <div className="h-2 w-full bg-foreground/20 rounded" />
                <div className="h-2 w-3/4 bg-foreground/20 rounded" />
                <div className="h-2 w-full bg-foreground/20 rounded" />
                <div className="h-2 w-5/6 bg-foreground/20 rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PhoneMock({ active }: { active: boolean }) {
  return (
    <div className={cn(
      "w-full h-full transition-all duration-700",
      active ? "opacity-100" : "opacity-0"
    )}>
      <div className="relative w-full h-full bg-[#1a1a1e] rounded-[2rem] overflow-hidden border-[3px] border-white/20 shadow-2xl">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-[#1a1a1e] rounded-b-xl z-10" />
        {/* Status Bar */}
        <div className="h-10 bg-[#222226] flex items-center justify-between px-5 pt-2">
          <div className="h-2 w-10 bg-white/20 rounded" />
          <div className="flex gap-1">
            <div className="h-2 w-4 bg-white/20 rounded" />
            <div className="h-2 w-5 bg-white/20 rounded" />
          </div>
        </div>
        {/* Mobile Reader */}
        <div className="bg-white h-[calc(100%-2.5rem)] p-5">
          <div className="space-y-3">
            <div className="h-2 w-16 bg-primary/20 rounded" />
            <div className="h-4 w-2/3 bg-foreground/80 rounded" />
            <div className="pt-3 space-y-1.5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className={cn(
                  "h-1.5 bg-foreground/20 rounded",
                  i === 5 ? "w-3/4" : "w-full"
                )} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShelfMock({ active }: { active: boolean }) {
  return (
    <div className={cn(
      "w-full h-full transition-all duration-700",
      active ? "opacity-100" : "opacity-0"
    )}>
      <div className="relative w-full h-full bg-white rounded-xl overflow-hidden border border-border/50 shadow-2xl">
        {/* Header */}
        <div className="h-14 bg-card/80 backdrop-blur border-b border-border/30 flex items-center px-5 justify-between">
          <div className="h-3 w-24 bg-primary/30 rounded" />
          <div className="flex gap-2">
            <div className="h-7 w-7 rounded-full bg-muted/50" />
            <div className="h-7 w-7 rounded-full bg-muted/50" />
          </div>
        </div>
        {/* Book Grid */}
        <div className="p-5 grid grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="aspect-[2/3] rounded-lg overflow-hidden bg-muted/30 border border-border/20">
              <div className="w-full h-full flex items-center justify-center">
                <div className={cn(
                  "w-3/4 h-3/4 rounded",
                  i % 4 === 0 && "bg-primary/20",
                  i % 4 === 1 && "bg-accent/30",
                  i % 4 === 2 && "bg-muted/50",
                  i % 4 === 3 && "bg-primary/10"
                )} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Scroll Reveal Hook ───
function useScrollReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, isVisible] as const;
}

// ─── Gallery Data ───
const GALLERY_ITEMS = [
  {
    title: '桌面端阅读',
    line: 'Foliate.js 驱动的极致排版体验',
    mockup: 'desktop' as const
  },
  {
    title: '移动端适配',
    line: '单手操作，随时随地开启阅读',
    mockup: 'phone' as const
  },
  {
    title: '图书管理',
    line: '优雅的封面瀑布流与分类归档',
    mockup: 'shelf' as const
  }
];

// ─── Main Page Component ───
export default function Home() {
  const { isLoading, isAuthenticated } = useAuth({ redirectOnExpire: false });
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [isSwitching, setIsSwitching] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [heroRef, heroVisible] = useScrollReveal(0.1);
  const [galleryRef, galleryVisible] = useScrollReveal();
  const [featuresRef, featuresVisible] = useScrollReveal();
  const [principlesRef, principlesVisible] = useScrollReveal();
  const [ctaRef, ctaVisible] = useScrollReveal();
  const [faqRef, faqVisible] = useScrollReveal();
  const [footerRef, footerVisible] = useScrollReveal();

  const activateGallery = useCallback((next: number) => {
    if (next === galleryIndex || isSwitching) return;
    setIsSwitching(true);
    setTimeout(() => {
      setGalleryIndex(next);
      setIsSwitching(false);
    }, 460);
  }, [galleryIndex, isSwitching]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('dark');
    }

    timerRef.current = setInterval(() => {
      activateGallery((galleryIndex + 1) % GALLERY_ITEMS.length);
    }, 5000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [galleryIndex, isSwitching, activateGallery]);

  return (
    <AppScreen ambient="login" className="overflow-x-hidden selection:bg-primary/10">
      <main className="relative mx-auto max-w-[1200px] px-6 md:px-12 lg:px-16">

        {/* ═══════════════════════════════════════════
            HERO SECTION — Typographic Drama
            ═══════════════════════════════════════════ */}
        <section
          ref={heroRef}
          className={cn(
            "relative min-h-[85vh] flex flex-col justify-center pt-20 pb-32 transition-all duration-1000",
            heroVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          )}
        >
          {/* Top Meta Bar */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between py-6 text-[11px] font-semibold tracking-[0.2em] text-muted-foreground/60 uppercase">
            <div className="flex items-center gap-4">
              <span>Edition 2026</span>
              <span className="h-px w-6 bg-border" />
              <span>Personal Library</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="https://github.com/zuoban/z-reader/releases" className="text-primary hover:opacity-70 transition-opacity">
                v1.0.0
              </Link>
              <Link href="https://github.com/zuoban/z-reader" target="_blank" className="text-muted-foreground hover:text-foreground transition-colors">
                <GithubIcon className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Brand Mark */}
          <div className="mb-12">
            <BrandMark size="lg" priority />
          </div>

          {/* Hero Statement */}
          <div className="relative">
            <h1 className="font-sans text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black text-foreground leading-[1.1] tracking-tight max-w-4xl">
              安静地，
              <br />
              放下一本书。
            </h1>
            <p className="mt-8 font-sans text-xl md:text-2xl font-medium leading-relaxed text-muted-foreground/80 max-w-2xl">
              一个面向个人书架的阅读空间。把不同格式的电子书放进同一个干净的平面。
            </p>
          </div>

          {/* Tech Pills */}
          <div className="mt-10 flex flex-wrap gap-3">
            {['EPUB', 'PDF', 'MOBI', 'AZW3'].map((fmt) => (
              <span
                key={fmt}
                className="px-4 py-2 rounded-full border border-border/40 bg-card/50 text-[11px] font-semibold tracking-widest text-muted-foreground/70 uppercase"
              >
                {fmt}
              </span>
            ))}
            <span className="h-6 w-px bg-border/40 self-center mx-1" />
            {['Foliate.js', 'Next.js', 'Go'].map((tech) => (
              <span
                key={tech}
                className="px-4 py-2 rounded-full border border-border/40 bg-card/50 text-[11px] font-semibold tracking-widest text-muted-foreground/70"
              >
                {tech}
              </span>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-14 flex items-center gap-6">
            <Button
              nativeButton={false}
              className="h-12 px-8 rounded-full bg-primary text-[14px] font-semibold tracking-wide text-primary-foreground shadow-lg transition-all hover:-translate-y-0.5 hover:bg-primary/92 active:scale-95"
              render={(props) => (
                <Link href={!isLoading && isAuthenticated ? "/shelf" : "/login"} {...props}>
                  开始阅读
                  <MoveRight className="ml-2 h-4 w-4" />
                </Link>
              )}
            />
          </div>

          {/* Scroll Indicator */}
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center pb-8">
            <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
              <ArrowDown className="h-4 w-4 animate-bounce" />
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════
            GALLERY SECTION — Device Mockups
            ═══════════════════════════════════════════ */}
        <section
          ref={galleryRef}
          className={cn(
            "py-24 md:py-32 transition-all duration-1000 delay-200",
            galleryVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
          )}
        >
          <SectionNumber number="00" label="阅读体验" />

          <div className="mb-12">
            <h2 className="font-heading text-3xl md:text-4xl font-semibold text-foreground tracking-tight">
              纯净、专注、跨设备。
            </h2>
            <p className="mt-4 max-w-xl text-base text-muted-foreground leading-relaxed">
              无论在桌面端还是移动端，都提供最接近纸质书的纯净排版，自动同步每一页进度。
            </p>
          </div>

          {/* Mockup Display */}
          <div className="relative">
            {/* Glow Effect */}
            <div className="absolute -inset-4 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 rounded-[2rem] blur-xl opacity-60" />

            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-border/30 bg-[#141318] shadow-2xl">
              <div className="absolute inset-0 p-4 sm:p-6">
                <DesktopMock active={galleryIndex === 0 && !isSwitching} />
                <PhoneMock active={galleryIndex === 1 && !isSwitching} />
                <ShelfMock active={galleryIndex === 2 && !isSwitching} />
              </div>
            </div>

            {/* Gallery Controls */}
            <div className="mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className={cn(
                "transition-all duration-500",
                isSwitching ? "opacity-0 translate-x-2" : "opacity-100 translate-x-0"
              )}>
                <h3 className="font-heading text-xl font-semibold text-foreground">
                  {GALLERY_ITEMS[galleryIndex].title}
                </h3>
                <p className="text-sm italic text-muted-foreground/70 mt-0.5">
                  {GALLERY_ITEMS[galleryIndex].line}
                </p>
              </div>

              <div className="flex gap-2">
                {GALLERY_ITEMS.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => activateGallery(i)}
                    className={cn(
                      "px-4 py-2 rounded-full text-xs font-semibold tracking-wide transition-all border",
                      galleryIndex === i
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-transparent border-border/40 text-muted-foreground/60 hover:border-border hover:bg-muted/20"
                    )}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════
            FEATURES SECTION — Editorial Spread
            ═══════════════════════════════════════════ */}
        <section
          ref={featuresRef}
          className={cn(
            "py-24 md:py-32 transition-all duration-1000 delay-200",
            featuresVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
          )}
        >
          <SectionNumber number="01" label="核心功能" />

          <h2 className="font-heading text-3xl md:text-4xl font-semibold text-foreground tracking-tight mb-16">
            为深度阅读者而生。
          </h2>

          {/* Asymmetric Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-16">
            {[
              {
                icon: Library,
                name: '全格式支持',
                small: 'EPUB · MOBI · AZW3 · PDF',
                what: '统一管理你的所有电子藏书。导入即自动提取元数据与封面，建立整齐的个人图书馆。'
              },
              {
                icon: RefreshCw,
                name: '进度云同步',
                small: '多端续读',
                what: '阅读状态实时保存至后端数据库。无论从哪台设备打开，都能立即回到上次停下的行间。'
              },
              {
                icon: Headphones,
                name: '语音伴读',
                small: 'TTS 技术',
                what: '支持配置第三方 TTS 服务。当你需要闭上眼睛或正在通勤时，让书籍"读"给你听。'
              },
              {
                icon: LayoutGrid,
                name: '精细分类',
                small: '标签与排序',
                what: '灵活的分类管理系统。支持按作者、系列或自定义标签筛选，让你的书架井然有序。'
              }
            ].map((feature, i) => (
              <div
                key={i}
                className={cn(
                  "group transition-all duration-700",
                  featuresVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                )}
                style={{ transitionDelay: `${i * 100 + 300}ms` }}
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted/30 text-primary/60 group-hover:bg-primary/10 group-hover:text-primary transition-all duration-300">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <div className="flex flex-col">
                    <h4 className="font-heading text-xl font-semibold text-foreground group-hover:text-primary transition-colors">
                      {feature.name}
                    </h4>
                    <span className="text-[10px] font-bold tracking-widest text-muted-foreground/40 uppercase mt-0.5">
                      {feature.small}
                    </span>
                    <p className="text-[15px] leading-relaxed text-muted-foreground/75 mt-2">
                      {feature.what}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ═══════════════════════════════════════════
            PRINCIPLES SECTION — Marginalia Style
            ═══════════════════════════════════════════ */}
        <section
          ref={principlesRef}
          className={cn(
            "py-24 md:py-32 transition-all duration-1000 delay-200",
            principlesVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
          )}
        >
          <SectionNumber number="02" label="设计原则" />

          <h2 className="font-heading text-3xl md:text-4xl font-semibold text-foreground tracking-tight mb-16">
            少即是多，慢即是快。
          </h2>

          {/* Principles as Marginalia */}
          <div className="space-y-0">
            {[
              { n: '01', title: '隐私至上', body: '数据完全掌握在自己手中，支持私有化部署。' },
              { n: '02', title: '零干扰', body: '没有广告，没有社交推送，只有你和书。' },
              { n: '03', title: '轻量高效', body: '采用 Go 编写的后端与轻量级阅读引擎，响应迅速。' },
              { n: '04', title: '开源精神', body: '透明的代码，活跃的社区，欢迎任何形式的贡献。' }
            ].map((principle, i) => (
              <div
                key={i}
                className={cn(
                  "group flex gap-6 md:gap-10 py-8 border-t border-border/30 transition-all duration-700",
                  principlesVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                )}
                style={{ transitionDelay: `${i * 100 + 300}ms` }}
              >
                <span className="font-mono text-sm font-bold text-primary/30 leading-none pt-1 shrink-0">
                  {principle.n}
                </span>
                <div className="flex-1">
                  <h5 className="font-heading text-lg font-semibold text-foreground mb-1.5 group-hover:text-primary transition-colors">
                    {principle.title}
                  </h5>
                  <p className="text-[14px] text-muted-foreground/70 leading-relaxed max-w-lg">
                    {principle.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ═══════════════════════════════════════════
            CTA SECTION — Invitation Card
            ═══════════════════════════════════════════ */}
        <section
          ref={ctaRef}
          className={cn(
            "py-24 md:py-32 transition-all duration-1000 delay-200",
            ctaVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
          )}
        >
          <div className="relative rounded-2xl border border-border/40 bg-card/40 overflow-hidden">
            {/* Decorative Corner */}
            <div className="absolute top-0 right-0 w-32 h-32 opacity-[0.04]">
              <svg width="128" height="128" viewBox="0 0 128 128" fill="currentColor">
                <path d="M0 0 L128 0 L128 8 L8 8 L8 128 L0 128 Z" />
              </svg>
            </div>

            <div className="relative px-8 py-16 md:px-16 md:py-20 text-center">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-border/50 bg-background/60 mb-10">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                <span className="text-[10px] font-bold tracking-[0.3em] text-primary uppercase">
                  Free & Open Source
                </span>
              </div>

              {/* Statement */}
              <h3 className="font-heading text-3xl md:text-5xl font-semibold text-foreground tracking-tight max-w-2xl mx-auto leading-tight">
                一次部署，终身拥有。
              </h3>
              <p className="mt-6 font-heading text-lg text-muted-foreground/60 max-w-xl mx-auto leading-relaxed">
                相比于商业阅读器的订阅费用，Z Reader 提供完全免费的自部署方案。
              </p>

              {/* CTA Button */}
              <div className="mt-12">
                <Button
                  nativeButton={false}
                  className="h-14 px-10 rounded-full bg-primary text-[14px] font-semibold tracking-wide text-primary-foreground shadow-xl transition-all hover:-translate-y-0.5 hover:bg-primary/92 active:scale-95 hover:shadow-2xl"
                  render={(props) => (
                    <Link href="https://github.com/zuoban/z-reader" {...props}>
                      获取源代码
                      <GithubIcon className="ml-2 h-4 w-4 opacity-70" />
                    </Link>
                  )}
                />
              </div>

              {/* Footer Meta */}
              <div className="mt-12 flex items-center justify-center gap-4 text-[10px] text-muted-foreground/30 font-bold tracking-[0.3em] uppercase">
                <span>MIT License</span>
                <span className="h-1 w-1 rounded-full bg-border/50" />
                <span>GitHub</span>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════
            FAQ SECTION — Conversation Style
            ═══════════════════════════════════════════ */}
        <section
          id="faq"
          ref={faqRef}
          className={cn(
            "py-24 md:py-32 scroll-mt-12 transition-all duration-1000 delay-200",
            faqVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
          )}
        >
          <SectionNumber number="03" label="常见问题" />

          <h2 className="font-heading text-3xl md:text-4xl font-semibold text-foreground tracking-tight mb-16">
            解决你的疑惑。
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
            {[
              {
                q: '如何部署 Z Reader？',
                a: '最简单的方法是使用 Docker。运行 docker run -d -p 80:80 -e APP_PASSWORD=... ghcr.io/zuoban/z-reader 即可启动。'
              },
              {
                q: '支持哪些电子书格式？',
                a: '目前原生支持 EPUB, MOBI, AZW3 和 PDF。对于带 DRM 加密的图书，请先移除加密后再上传。'
              },
              {
                q: '如何启用 TTS 语音朗读？',
                a: '你需要在配置文件或环境变量中填入你自己的 TTS 服务凭据（如微软 Azure 或 Google Cloud TTS）。具体步骤请参考文档。'
              },
              {
                q: '数据存储在哪里？',
                a: '所有图书、元数据和进度均存储在你的本地服务器或 Docker 卷中。Z Reader 承诺不收集任何个人阅读数据。'
              }
            ].map((item, i) => (
              <div
                key={i}
                className={cn(
                  "group rounded-xl p-6 border border-border/30 bg-card/30 hover:border-primary/20 hover:bg-card/50 transition-all duration-700",
                  faqVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                )}
                style={{ transitionDelay: `${i * 100 + 300}ms` }}
              >
                <h5 className="font-heading text-lg font-semibold text-foreground mb-2 tracking-tight group-hover:text-primary transition-colors">
                  {item.q}
                </h5>
                <p className="text-[14px] text-muted-foreground/70 leading-relaxed">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ═══════════════════════════════════════════
            FOOTER
            ═══════════════════════════════════════════ */}
        <footer
          ref={footerRef}
          className={cn(
            "py-20 border-t border-border/30 transition-all duration-1000",
            footerVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          )}
        >
          <div className="flex flex-col md:flex-row justify-between items-start gap-12">
            {/* Brand */}
            <div className="space-y-3">
              <span className="text-lg font-bold tracking-[0.4em] text-foreground/80 block leading-none uppercase">
                Z Reader
              </span>
              <span className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground/30 block uppercase">
                Edition 2026 · Personal Library
              </span>
            </div>

            {/* Quote */}
            <div className="text-left md:text-right flex-1">
              <p className="font-heading text-2xl md:text-3xl text-muted-foreground/[0.06] italic leading-[1.2] max-w-2xl md:ml-auto select-none">
                &ldquo;读书，是为了在喧嚣的世界中找到属于自己的安静角落。&rdquo;
              </p>
            </div>
          </div>
        </footer>

      </main>
    </AppScreen>
  );
}
