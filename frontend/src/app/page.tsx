import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { AppScreen, BrandLogo } from '@/components/AppShell';
import { LandingThemeToggle } from '@/components/LandingThemeToggle';
import { ReaderDeskPreview } from '@/components/ReaderDeskPreview';

const features = [
  {
    index: '01',
    title: '多格式导入与整理',
    description: '批量上传 EPUB、MOBI、AZW3 和 PDF，按自定义分类整理私人藏书。',
  },
  {
    index: '02',
    title: '段落级进度同步',
    description: '自动记住停下的位置，手机、平板和电脑打开就能接着读。',
  },
  {
    index: '03',
    title: '四套纸面与中文排版',
    description: '提供净白、旧书、苔纸与夜读纸面，支持字号、行距与首行缩进微调。',
  },
  {
    index: '04',
    title: '目录跳转与书签',
    description: '按章节目录快速定位，用书签留住想反复重读的段落。',
  },
  {
    index: '05',
    title: '离线缓存与手势翻页',
    description: '兼容键盘翻页与触控手势，提前缓存书籍后断网也能继续读。',
  },
  {
    index: '06',
    title: '开源自托管与语音朗读',
    description: '藏书与阅读记录留在自有服务器，需要时也能开启朗读。',
  },
];

const colophonItems = [
  { label: '支持格式', value: 'EPUB · MOBI · AZW3 · PDF' },
  { label: '阅读纸面', value: '净白 · 旧书 · 苔纸 · 夜读' },
  { label: '数据归属', value: '开源自托管 · 离线缓存' },
];

export default function LandingPage() {
  return (
    <AppScreen contentClassName="entry-screen flex flex-col">
      <header className="border-b border-border">
        <div className="app-container flex h-16 items-center justify-between gap-4">
          <BrandLogo compact />
          <nav className="flex items-center gap-2 sm:gap-3" aria-label="主导航">
            <a href="#features" className="entry-nav-link hidden sm:inline-flex">
              功能目录
            </a>
            <LandingThemeToggle />
            <Link href="/shelf" className="entry-header-cta">
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
            <p className="mt-5 max-w-[30rem] text-pretty text-base leading-7 text-subtle-foreground sm:mt-6 sm:text-lg sm:leading-8">
              自托管你的 EPUB、MOBI、AZW3 与 PDF 藏书，在手机、平板和电脑上随时接着读。
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/shelf"
                className="app-primary-link entry-action entry-primary-action group"
              >
                进入我的书架
                <ArrowRight
                  size={16}
                  strokeWidth={1.5}
                  className="transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                  aria-hidden="true"
                />
              </Link>
              <a href="#features" className="app-secondary-link entry-action">
                查看功能目录
              </a>
            </div>

            <dl className="landing-colophon">
              {colophonItems.map((item) => (
                <div key={item.label} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{item.label}</dt>
                  <dd className="mt-1 whitespace-nowrap text-xs font-medium text-subtle-foreground">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="w-full max-w-[36rem] lg:justify-self-end">
            <ReaderDeskPreview />
          </div>
        </section>

        <section
          id="features"
          className="scroll-mt-8 border-t border-border bg-surface-subtle py-20 sm:py-24 lg:py-28"
        >
          <div className="app-container grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16 xl:gap-20">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <p className="font-mono text-xs text-muted-foreground">卷目 · 01—06</p>
              <h2 className="entry-title mt-3 text-2xl sm:text-3xl">
                书库与阅读功能
              </h2>
              <p className="mt-4 max-w-xs text-pretty text-sm leading-6 text-subtle-foreground">
                从整理藏书到调整中文排版，把干扰留在书页之外。
              </p>
            </div>

            <ol className="grid gap-x-12 sm:grid-cols-2">
              {features.map((item) => (
                <li key={item.index} className="entry-catalog-item">
                  <span
                    aria-hidden="true"
                    className="font-mono text-xs leading-6 text-muted-foreground tabular-nums"
                  >
                    {item.index}
                  </span>
                  <div>
                    <h3 className="text-base font-medium leading-6 text-foreground">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-pretty text-sm leading-6 text-subtle-foreground">
                      {item.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="app-container flex flex-col gap-3 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="font-heading text-sm font-semibold text-foreground">Z Reader</span>
            <span aria-hidden="true">·</span>
            <span>安静的开源自托管私人书库</span>
          </div>
          <Link href="/shelf" className="text-subtle-foreground transition-colors hover:text-foreground">
            进入书架
          </Link>
        </div>
      </footer>
    </AppScreen>
  );
}
