import Link from 'next/link';
import { ArrowDown, Bookmark, Cloud, Palette, Server, Smartphone, Upload } from 'lucide-react';
import { AppScreen, BrandLogo } from '@/components/AppShell';
import { LandingAuthLink, LandingAuthProvider } from '@/components/LandingAuthLinks';
import { LibraryPreview } from '@/components/LibraryPreview';

const features = [
  { icon: Upload, title: '好书，都有归处', description: '批量导入 EPUB、MOBI、AZW3 和 PDF，用分类整理你的收藏。' },
  { icon: Cloud, title: '翻开，就是上次那页', description: '阅读进度跨设备同步，换一块屏幕，故事依然接得上。' },
  { icon: Palette, title: '找到舒服的读法', description: '从纸白到夜读，自由调整主题、字体与排版，让阅读合你心意。' },
  { icon: Bookmark, title: '值得重读的，留一签', description: '为喜欢的段落和章节留下书签，下次轻松回到这里。' },
  { icon: Smartphone, title: '随身带一间书房', description: '手机、平板和电脑，都是你的阅读角落。触控与键盘同样顺手。' },
  { icon: Server, title: '自己的书，自己保管', description: '开源、自托管。把书库与阅读记录，留在自己的服务里。' },
];

export default function LandingPage() {
  return (
    <LandingAuthProvider>
      <AppScreen ambient="shelf" contentClassName="flex min-h-dvh flex-col">
        <header className="app-container flex h-20 items-center justify-between border-b border-border">
          <BrandLogo />
          <nav className="flex items-center gap-6" aria-label="主导航">
            <a href="#features" className="hidden text-sm text-muted-foreground hover:text-primary sm:block">
              关于阅读
            </a>
            <LandingAuthLink />
          </nav>
        </header>

        <main className="flex-1">
          <section className="app-container landing-hero">
            <div className="max-w-xl">
              <p className="app-eyebrow flex items-center gap-3">
                <span className="h-px w-7 bg-primary" aria-hidden="true" />
                A quiet place to read
              </p>
              <h1 className="mt-6 font-heading text-5xl font-medium tracking-[-0.04em] sm:text-6xl lg:text-7xl">
                Z Reader
              </h1>
              <p className="mt-5 font-heading text-3xl font-semibold leading-relaxed tracking-tight sm:text-4xl sm:leading-relaxed">
                给阅读，<br />留一处安静的地方。
              </p>
              <p className="mt-5 max-w-md text-[15px] leading-8 text-muted-foreground sm:text-base">
                收好喜欢的书，接着上次的那一页。<br className="hidden sm:block" />
                一间属于你的数字书房，让每次打开，都离故事更近。
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <LandingAuthLink primary />
                <Link href="/login" className="app-secondary-link">登录</Link>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <span>私有书库</span>
                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-primary/40" />
                <span>多端续读</span>
                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-primary/40" />
                <span>沉浸阅读</span>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-xl lg:pl-4">
              <div className="mb-4 flex items-center justify-between px-1 text-[10px] tracking-[0.16em] text-muted-foreground" aria-hidden="true">
                <span>YOUR PERSONAL LIBRARY</span>
                <span>藏书 · 续读 · 沉浸</span>
              </div>
              <LibraryPreview />
              <p className="mt-5 text-center font-serif text-sm italic text-muted-foreground" aria-hidden="true">
                Between the pages, a world of your own.
              </p>
            </div>
          </section>

          <section id="features" className="scroll-mt-8 border-t border-border bg-card/60 py-14 sm:py-20">
            <div className="app-container">
              <div className="flex items-end justify-between gap-6">
                <div>
                  <p className="app-eyebrow">Made for your reading life</p>
                  <h2 className="mt-4 font-heading text-2xl font-semibold leading-relaxed sm:text-3xl">
                    少一点打扰，多一点沉浸。
                  </h2>
                </div>
                <ArrowDown className="mb-2 hidden h-5 w-5 text-primary sm:block" aria-hidden="true" />
              </div>
              <div className="mt-10 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-14">
                {features.map(({ icon: Icon, title, description }, index) => (
                  <div key={title} className="entry-feature">
                    <div className="mb-5 flex items-center justify-between text-primary">
                      <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                      <span className="font-mono text-[10px] text-muted-foreground" aria-hidden="true">0{index + 1}</span>
                    </div>
                    <h3 className="text-base font-semibold">{title}</h3>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">{description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>

        <footer className="app-container flex flex-col gap-3 border-t border-border py-7 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="font-serif text-base text-primary">Z Reader · 安静的私有书库</span>
          <span>开源 · 自托管 · 为阅读留白</span>
        </footer>
      </AppScreen>
    </LandingAuthProvider>
  );
}
