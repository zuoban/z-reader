import Link from 'next/link';
import { ArrowRight, Bookmark, Cloud, Palette, Server, Smartphone, Upload } from 'lucide-react';
import { AppScreen, BrandLogo } from '@/components/AppShell';
import { LibraryPreview } from '@/components/LibraryPreview';

const features = [
  { icon: Upload, title: '导入与分类', description: '批量导入 EPUB、MOBI、AZW3 和 PDF，按分类整理书库' },
  { icon: Cloud, title: '进度同步', description: '保存读到的段落，换设备也能接着读' },
  { icon: Palette, title: '主题与排版', description: '支持净白、旧书、苔纸和夜读主题，可调整字号、行距和中文缩进' },
  { icon: Bookmark, title: '目录与书签', description: '按目录跳到章节，用书签标记想再读的段落' },
  { icon: Smartphone, title: '跨设备与离线阅读', description: '支持键盘翻页与触控手势，缓存书籍后可离线阅读' },
  { icon: Server, title: '开源自托管', description: '在自己的服务器上保存书籍和阅读记录' },
];

export default function LandingPage() {
  return (
    <AppScreen contentClassName="entry-screen flex flex-col">
      <header className="border-b border-border">
        <div className="app-container flex h-14 items-center justify-between gap-4 sm:h-16">
          <BrandLogo compact />
          <nav className="flex items-center gap-6" aria-label="主导航">
            <a href="#features" className="entry-nav-link hidden sm:inline-flex">
              功能一览
            </a>
            <Link href="/shelf" className="entry-nav-link inline-flex">
              进入书架
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="app-container landing-hero">
          <div className="min-w-0">
            <h1 className="entry-title landing-title">
              <span className="sr-only">Z Reader </span>
              你的私人书库<br />打开就是上次那页
            </h1>
            <p className="mt-4 max-w-[27rem] text-pretty text-base leading-7 text-muted-foreground sm:mt-5">
              自托管 EPUB、MOBI、AZW3 和 PDF 书库，在手机、平板和电脑上接着读
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3 sm:mt-8">
              <Link href="/shelf" className="app-primary-link entry-action group">
                进入我的书架
                <ArrowRight
                  size={16}
                  strokeWidth={1.5}
                  className="transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                  aria-hidden="true"
                />
              </Link>
              <a href="#features" className="app-secondary-link entry-action">
                了解功能
              </a>
            </div>
          </div>

          <div className="w-full max-w-[34rem] lg:justify-self-end">
            <LibraryPreview />
          </div>
        </section>

        <section id="features" className="scroll-mt-8 border-y border-border bg-surface-subtle py-14 sm:py-16 lg:py-20">
          <div className="app-container grid gap-8 lg:grid-cols-[1fr_2fr] lg:gap-16 xl:gap-20">
            <div>
              <h2 className="entry-title text-2xl sm:text-[1.75rem]">
                书库与阅读功能
              </h2>
              <p className="mt-3 max-w-sm text-pretty text-sm leading-6 text-muted-foreground">
                整理藏书、调整排版，也可以开启朗读
              </p>
            </div>
            <ul role="list" className="grid gap-x-8 sm:grid-cols-2">
              {features.map(({ icon: Icon, title, description }) => (
                <li key={title} className="entry-feature">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-card text-primary/85 shadow-[var(--paper-shadow-control)]">
                    <Icon size={15} strokeWidth={1.6} aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-medium text-foreground">{title}</h3>
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
          <span className="font-heading text-sm font-medium text-foreground">Z Reader</span>
          <span>开源自托管私人书库</span>
        </div>
      </footer>
    </AppScreen>
  );
}
