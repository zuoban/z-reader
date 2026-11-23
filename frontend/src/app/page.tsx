import Link from 'next/link';
import { ArrowRight, Bookmark, Cloud, Palette, Server, Smartphone, Upload } from 'lucide-react';
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
    <AppScreen contentClassName="entry-screen flex flex-col">
      <header className="border-b border-border">
        <div className="app-container flex min-h-16 items-center justify-between gap-4">
          <BrandLogo />
          <nav className="flex items-center gap-6" aria-label="主导航">
            <a
              href="#features"
              className="hidden min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            >
              功能一览
            </a>
            <Link href="/shelf" className="app-secondary-link whitespace-nowrap px-4">
              进入书架
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="app-container landing-hero">
          <div className="min-w-0">
            <h1 className="landing-title font-heading font-semibold">Z Reader</h1>
            <p className="mt-5 font-heading text-[clamp(1.375rem,2.65vw,2.125rem)] font-semibold leading-[1.45] sm:mt-6">
              把喜欢的书收进自己的书房<br />翻开就是上次那页
            </p>
            <p className="mt-4 max-w-[30rem] text-pretty text-[15px] leading-7 text-muted-foreground sm:text-base">
              自托管多格式私人电子书库。导入 EPUB、MOBI、AZW3 与 PDF，在手机、平板和电脑间保持同一页阅读进度。
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 sm:mt-8">
              <Link href="/shelf" className="app-primary-link">
                进入我的书架
                <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
              </Link>
              <a
                href="#features"
                className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-current"
              >
                了解特性
              </a>
            </div>
          </div>

          <div className="w-full max-w-[38rem]">
            <LibraryPreview />
          </div>
        </section>

        <section id="features" className="scroll-mt-8 border-y border-border bg-surface-subtle py-12 sm:py-16 lg:py-20">
          <div className="app-container grid gap-8 lg:grid-cols-[1fr_2fr] lg:gap-16 xl:gap-24">
            <div>
              <h2 className="max-w-[12em] text-balance font-heading text-2xl font-semibold leading-snug sm:text-3xl">
                少一点打扰，专注阅读本身
              </h2>
              <p className="mt-3 max-w-sm text-pretty text-sm leading-6 text-muted-foreground">
                从导入整理到翻页朗读，把常用的功能做到顺手、安静。
              </p>
            </div>
            <ul role="list" className="grid gap-x-8 sm:grid-cols-2">
              {features.map(({ icon: Icon, title, description }) => (
                <li key={title} className="entry-feature">
                  <Icon size={18} className="mt-1 text-primary" strokeWidth={1.5} aria-hidden="true" />
                  <div>
                    <h3 className="text-[15px] font-semibold">{title}</h3>
                    <p className="mt-1.5 text-pretty text-sm leading-6 text-muted-foreground">
                      {description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer>
        <div className="app-container flex flex-col gap-2 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="font-heading text-sm text-foreground">Z Reader</span>
          <span>开源自托管私人书库</span>
        </div>
      </footer>
    </AppScreen>
  );
}
