import Link from 'next/link';
import { Bookmark, Cloud, Palette, Server, Smartphone, Upload } from 'lucide-react';
import { AppScreen, BrandLogo } from '@/components/AppShell';
import { LibraryPreview } from '@/components/LibraryPreview';

const features = [
  { icon: Upload, title: '多格式统一收纳', description: '支持批量导入 EPUB、MOBI、AZW3 和 PDF，用分类整理个人书库' },
  { icon: Cloud, title: '阅读进度实时同步', description: '记录精确到段落位置，换设备打开直接接着上次读' },
  { icon: Palette, title: '细粒度排版调节', description: '净白、旧书、苔纸与夜读四种主题，字号、行距和中文缩进自由设定' },
  { icon: Bookmark, title: '章节目录与书签', description: '随时为常翻的段落做标记，长书跳读更快回到原处' },
  { icon: Smartphone, title: '桌面与移动同样顺手', description: '支持键盘翻页、触控手势与本地离线缓存，断网也能读' },
  { icon: Server, title: '开源自托管', description: '书籍与阅读记录只存在你自己的服务器里，不依赖第三方云盘' },
];

export default function LandingPage() {
  return (
    <AppScreen contentClassName="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="app-container flex h-16 items-center justify-between">
          <BrandLogo />
          <nav className="flex items-center gap-6" aria-label="主导航">
            <a href="#features" className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block">
              功能一览
            </a>
            <Link href="/shelf" className="app-secondary-link min-h-9 px-4 text-sm">
              进入书架
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="app-container landing-hero">
          <div className="max-w-xl">
            <h1 className="font-heading text-5xl font-medium tracking-[-0.03em] text-foreground sm:text-6xl">
              Z Reader
            </h1>
            <p className="mt-5 font-heading text-2xl font-medium leading-snug text-foreground sm:text-3xl">
              把喜欢的书收进自己的书房<br />翻开就是上次那页
            </p>
            <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground sm:text-[15px]">
              自托管多格式私人电子书库。导入 EPUB、MOBI、AZW3 与 PDF，在手机、平板和电脑间保持同一页阅读进度。
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/shelf" className="app-primary-link">
                进入我的书架
              </Link>
              <a href="#features" className="app-secondary-link">
                了解特性
              </a>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <span>开源自托管</span>
              <span aria-hidden="true" className="text-muted-foreground/45">/</span>
              <span>EPUB · MOBI · AZW3 · PDF</span>
              <span aria-hidden="true" className="text-muted-foreground/45">/</span>
              <span>跨端续读与离线缓存</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:pl-4">
            <LibraryPreview />
          </div>
        </section>

        <section id="features" className="scroll-mt-8 border-t border-border bg-card/60 py-14 sm:py-20">
          <div className="app-container">
            <div className="max-w-xl">
              <h2 className="font-heading text-2xl font-medium leading-snug text-foreground sm:text-3xl">
                少一点打扰，专注阅读本身
              </h2>
              <p className="mt-2.5 text-sm leading-6 text-muted-foreground">
                从导入整理到翻页朗读，把常用的功能做到顺手、安静。
              </p>
            </div>
            <div className="mt-10 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-12">
              {features.map(({ icon: Icon, title, description }) => (
                <div key={title} className="entry-feature">
                  <div className="mb-4 text-primary">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden="true" />
                  </div>
                  <h3 className="text-[15px] font-medium text-foreground">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="app-container flex flex-col gap-2 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="font-heading text-sm text-foreground">Z Reader</span>
          <span>开源自托管私人书库</span>
        </div>
      </footer>
    </AppScreen>
  );
}
