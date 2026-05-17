'use client';

import Link from 'next/link';
import Image from 'next/image';
import { AppScreen } from '@/components/AppShell';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { useEffect, useState, useRef } from 'react';

const GALLERY_ITEMS = [
  {
    title: '极致排版',
    line: '基于 Foliate.js 的强大渲染能力',
    placeholder: '[ 桌面端阅读界面预览 ]'
  },
  {
    title: '移动适配',
    line: '单手操作，随时随地开启阅读',
    placeholder: '[ 移动端阅读界面预览 ]'
  },
  {
    title: '图书管理',
    line: '优雅的封面瀑布流与分类归档',
    placeholder: '[ 书架界面预览 ]'
  }
];

export default function Home() {
  const { isLoading, isAuthenticated } = useAuth({ redirectOnExpire: false });
  const [mounted, setMounted] = useState(false);

  // Sync labels with prototype exactly
  const primaryHref = !isLoading && isAuthenticated ? '/shelf' : '/shelf'; // Prototype shows both
  const primaryLabel = !isLoading && isAuthenticated ? '进入书架' : '进入书架';

  const [galleryIndex, setGalleryIndex] = useState(0);
  const [isSwitching, setIsSwitching] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const activateGallery = (next: number) => {
    if (next === galleryIndex || isSwitching) return;
    setIsSwitching(true);
    setTimeout(() => {
      setGalleryIndex(next);
      setIsSwitching(false);
    }, 460);
  };

  useEffect(() => {
    setMounted(true);
    // Force light theme
    document.documentElement.classList.remove('dark');
    
    timerRef.current = setInterval(() => {
      activateGallery((galleryIndex + 1) % GALLERY_ITEMS.length);
    }, 5000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [galleryIndex, isSwitching]);

  return (
    <AppScreen className="overflow-x-hidden font-serif bg-[#f5f4ed]">
      <style jsx global>{`
        @font-face {
          font-family: "TsangerJinKai02";
          src: url("https://cdn.jsdelivr.net/gh/AlfredoSequeworthy/TsangerJinKai02@main/TsangerJinKai02-W04.woff2") format("woff2");
          font-weight: 400;
          font-style: normal;
          font-display: swap;
        }
        @font-face {
          font-family: "TsangerJinKai02";
          src: url("https://cdn.jsdelivr.net/gh/AlfredoSequeworthy/TsangerJinKai02@main/TsangerJinKai02-W05.woff2") format("woff2");
          font-weight: 500;
          font-style: normal;
          font-display: swap;
        }

        .font-serif {
          font-family: "TsangerJinKai02", "Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", serif;
        }

        .kami-gradient {
          background: linear-gradient(135deg, rgba(27, 54, 93, 0.03) 0%, rgba(27, 54, 93, 0) 100%);
        }
      `}</style>

      <main className="mx-auto max-w-[1120px] px-6 py-12 md:px-16 md:py-20 lg:py-24 selection:bg-[#1B365D]/10 bg-[#f5f4ed] text-[#141413]">
        
        {/* Navigation / Header */}
        <header className="mb-20 border-b border-[#e8e6dc] pb-12">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4 text-[11px] font-medium tracking-[0.2em] text-[#6b6a64] uppercase">
              <span>Edition 2026 / Personal Library</span>
              <span className="h-px w-8 bg-[#d8d5c8]" />
              <Link href="https://github.com/zuoban/z-reader/releases" className="text-[#1B365D] hover:opacity-70 transition-opacity">v1.0.0</Link>
            </div>
            <div className="flex items-center gap-2">
              <Link href="https://github.com/zuoban/z-reader" target="_blank" className="text-[#6b6a64] hover:text-[#141413] transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7a3.37 3.37 0 0 0-.94 2.58V22"></path></svg>
              </Link>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
            <div className="flex items-center gap-6">
              <Image src="/icons/icon.svg" alt="" width={64} height={64} />
              <h1 className="text-7xl md:text-8xl font-medium tracking-tight leading-none text-[#141413]">
                Z Reader
              </h1>
            </div>
            <div className="flex gap-3">
              <Link 
                href="/shelf" 
                className="flex h-12 min-w-[158px] items-center justify-center rounded-full bg-[#1B365D] px-8 text-[15px] font-medium text-[#faf9f5] hover:opacity-90 transition-all shadow-sm"
              >
                开始阅读
              </Link>
            </div>
          </div>

          <p className="mt-10 max-w-[820px] text-xl md:text-2xl leading-relaxed text-[#504e49] font-normal">
            安静地，放下一本书。一个面向个人书架的阅读空间。把不同格式的电子书放进同一个干净的平面。
          </p>

          <div className="mt-10 flex flex-wrap gap-x-8 gap-y-2 text-xs font-medium tracking-wider text-[#6b6a64] uppercase">
            <span className="flex items-center gap-2">支持 <b className="text-[#141413]/80">EPUB / PDF / MOBI / AZW3</b></span>
            <span className="flex items-center gap-2">驱动 <b className="text-[#141413]/80">Foliate.js / Next.js / Go</b></span>
          </div>
        </header>

        {/* 00 · Gallery */}
        <section className="mb-24">
          <div className="mb-10">
            <p className="text-xs font-medium tracking-widest text-[#1B365D] uppercase mb-2">00 · 阅读体验</p>
            <h2 className="text-4xl font-medium text-[#141413] tracking-tight">纯净、专注、跨设备。</h2>
            <p className="mt-4 max-w-2xl text-lg text-[#504e49] leading-relaxed">无论在桌面端还是移动端，Z Reader 都致力于提供最接近纸质书的纯净排版，并自动同步你的每一页进度。</p>
          </div>

          <div className="relative group">
            <div className="aspect-[16/10] w-full overflow-hidden rounded-lg border border-[#e8e6dc] bg-[#141318] flex items-center justify-center shadow-xl relative">
              
              <div className={cn(
                "transition-all duration-700 ease-in-out transform flex flex-col items-center gap-6 z-10 text-center px-12",
                isSwitching ? "opacity-0 scale-95 blur-md" : "opacity-100 scale-100 blur-0"
              )}>
                <span className="font-mono text-sm text-[#6b6a64]">{GALLERY_ITEMS[galleryIndex].placeholder}</span>
              </div>
            </div>
            
            <div className="mt-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className={cn("transition-all duration-500", isSwitching ? "opacity-0 translate-x-2" : "opacity-100 translate-x-0")}>
                <h3 className="text-2xl font-medium text-[#141413]">{GALLERY_ITEMS[galleryIndex].title}</h3>
                <p className="text-base italic text-[#504e49] mt-1">{GALLERY_ITEMS[galleryIndex].line}</p>
              </div>
              <div className="flex gap-2">
                {GALLERY_ITEMS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => activateGallery(i)}
                    className={cn(
                      "h-10 px-5 rounded-full text-xs font-medium transition-all border",
                      galleryIndex === i 
                        ? "bg-[#1B365D]/10 border-[#1B365D]/20 text-[#1B365D]" 
                        : "bg-transparent border-[#e8e6dc] text-[#6b6a64] hover:border-[#d8d5c8]"
                    )}
                  >
                    {GALLERY_ITEMS[i].title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 01 · 核心功能 */}
        <section className="mb-24">
          <div className="mb-12 pb-4 border-b border-[#e8e6dc]">
            <p className="text-xs font-medium tracking-widest text-[#1B365D] uppercase mb-2">01 · 核心功能</p>
            <h2 className="text-4xl font-medium text-[#141413] tracking-tight">为深度阅读者而生。</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-x-16 gap-y-12">
            {[
              { name: '全格式支持', small: 'EPUB, MOBI, AZW3, PDF', what: '统一管理你的所有电子藏书。导入即自动提取元数据与封面，建立整齐的个人图书馆。' },
              { name: '进度云同步', small: '多端续读', what: '阅读状态实时保存至后端数据库。无论从哪台设备打开，都能立即回到上次停下的行间。' },
              { name: '语音伴读', small: 'TTS 技术', what: '支持配置第三方 TTS 服务。当你需要闭上眼睛或正在通勤时，让书籍“读”给你听。' },
              { name: '精细分类', small: '标签与排序', what: '灵活的分类管理系统。支持按作者、系列或自定义标签筛选，让你的书架井然有序。' }
            ].map((feature, i) => (
              <div key={i} className="group">
                <div className="flex items-baseline gap-4 mb-3">
                  <h4 className="text-2xl font-medium text-[#141413] group-hover:text-[#1B365D] transition-colors">{feature.name}</h4>
                  <span className="text-xs italic text-[#504e49]/60">{feature.small}</span>
                </div>
                <p className="text-[16px] leading-relaxed text-[#504e49]/80">{feature.what}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 02 · 设计原则 */}
        <section className="mb-24">
          <div className="mb-10">
            <p className="text-xs font-medium tracking-widest text-[#1B365D] uppercase mb-2">02 · 设计原则</p>
            <h2 className="text-4xl font-medium text-[#141413] tracking-tight">少即是多，慢即是快。</h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-px bg-[#e8e6dc]/40 border border-[#e8e6dc]/40 rounded-lg overflow-hidden shadow-sm">
            {[
              { n: '01', title: '隐私至上', body: '数据完全掌握在自己手中，支持私有化部署。' },
              { n: '02', title: '零干扰', body: '没有广告，没有社交推送，只有你和书。' },
              { n: '03', title: '轻量高效', body: '采用 Go 编写的后端与轻量级阅读引擎，响应迅速。' },
              { n: '04', title: '开源精神', body: '透明的代码，活跃的社区，欢迎任何形式的贡献。' }
            ].map((principle, i) => (
              <div key={i} className="bg-[#f5f4ed] p-10 flex gap-6 items-start hover:bg-[#faf9f5] transition-colors">
                <span className="text-2xl font-medium text-[#1B365D]/40 leading-none">{principle.n}</span>
                <div>
                  <h5 className="text-lg font-medium text-[#141413] mb-2">{principle.title}</h5>
                  <p className="text-[14px] text-[#504e49] leading-relaxed">{principle.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 03 · 获取方式 */}
        <section className="mb-24 py-24 kami-gradient border-y border-[#e8e6dc] text-center rounded-2xl">
          <div className="max-w-2xl mx-auto px-6">
            <span className="text-[90px] md:text-[120px] font-medium leading-none text-[#141413]/90 tracking-tighter">$0</span>
            <p className="mt-10 text-xl text-[#504e49]/90 leading-relaxed">
              相比于商业阅读器的订阅费用，Z Reader 提供完全免费的自部署方案。<br className="hidden md:block" />
              <b className="text-[#1B365D] font-medium">一次部署，终身拥有。</b>
            </p>
            <div className="mt-14 flex flex-col sm:flex-row items-center justify-center gap-5">
              <Link href="https://github.com/zuoban/z-reader" className="h-16 min-w-[260px] flex items-center justify-center rounded-full bg-[#1B365D] px-10 text-base font-medium text-[#faf9f5] hover:opacity-90 transition-all shadow-lg hover:-translate-y-0.5">
                查看 GitHub 源码
              </Link>
            </div>
            <p className="mt-6 text-sm text-[#6b6a64]/60 italic tracking-wide">遵循 MIT 开源协议。</p>
            <p className="mt-2 text-[13.5px] text-[#504e49]">你需要自行准备服务器环境或使用 Docker 运行。</p>
          </div>
        </section>

        {/* 04 · 常见问题 */}
        <section id="faq" className="mb-24 scroll-mt-12">
          <div className="mb-10 pb-4 border-b border-[#e8e6dc]">
            <p className="text-xs font-medium tracking-widest text-[#1B365D] uppercase mb-2">04 · 常见问题</p>
            <h2 className="text-4xl font-medium text-[#141413] tracking-tight">解决你的疑惑。</h2>
          </div>

          <div className="space-y-10">
            {[
              { q: '如何部署 Z Reader？', a: '最简单的方法是使用 Docker。运行 docker run -d -p 80:80 -e APP_PASSWORD=... ghcr.io/zuoban/z-reader 即可启动。' },
              { q: '支持哪些电子书格式？', a: '目前原生支持 EPUB, MOBI, AZW3 和 PDF。对于带 DRM 加密的图书，请先移除加密后再上传。' },
              { q: '如何启用 TTS 语音朗读？', a: '你需要在配置文件或环境变量中填入你自己的 TTS 服务凭据（如微软 Azure 或 Google Cloud TTS）。具体步骤请参考文档。' }
            ].map((item, i) => (
              <div key={i} className="max-w-3xl">
                <h5 className="text-xl font-medium text-[#141413] mb-3 tracking-tight">{item.q}</h5>
                <p className="text-[15px] text-[#504e49]/80 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="pt-16 border-t border-[#e8e6dc] flex flex-col md:flex-row justify-between items-start md:items-end gap-16 pb-12">
          <div className="flex gap-6 items-start">
            <Image src="/icons/icon.svg" alt="" width={56} height={56} />
            <div>
              <span className="text-4xl font-medium text-[#141413] block leading-tight tracking-tight">Z Reader</span>
              <span className="text-base text-[#504e49] mt-1 block">面向个人书架的开源阅读器</span>
            </div>
          </div>
          
          <div className="text-left md:text-right">
            <div className="flex gap-4 text-xs font-medium text-[#6b6a64]/80 mb-6 md:justify-end uppercase tracking-widest">
              <Link href="https://github.com/zuoban/z-reader" className="hover:text-[#1B365D] transition-colors">GitHub</Link>
              <span className="text-[#d8d5c8]">·</span>
              <Link href="#faq" className="hover:text-[#1B365D] transition-colors">帮助</Link>
            </div>
            <p className="text-[15px] text-[#504e49] italic max-w-sm leading-relaxed">
              读书，是为了在喧嚣的世界中找到属于自己的安静角落。
            </p>
          </div>
        </footer>
      </main>
    </AppScreen>
  );
}
