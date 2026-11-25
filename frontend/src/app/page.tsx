import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { AppScreen, BrandLogo } from '@/components/AppShell';
import { LandingThemeToggle } from '@/components/LandingThemeToggle';
import { ReaderDeskPreview } from '@/components/ReaderDeskPreview';
import './styles/entry.css';

const featureGroups = [
  {
    chapter: '一',
    heading: '藏书与同步',
    items: [
      {
        index: '01',
        title: '多格式导入与整理',
        description: '批量上传 EPUB、MOBI、AZW3 与 PDF，按自定义分类归档私人藏书。',
      },
      {
        index: '02',
        title: '段落级进度同步',
        description: '自动记住停下的段落，手机、平板与电脑打开就能接着读。',
      },
      {
        index: '03',
        title: '开源自托管与离线缓存',
        description: '藏书与阅读记录留在自有服务器，提前缓存后断网也能继续读。',
      },
    ],
  },
  {
    chapter: '二',
    heading: '纸面与阅读',
    items: [
      {
        index: '04',
        title: '四套纸面与中文排版',
        description: '提供净白、旧书、苔纸与夜读纸面，支持字号、行距与首行缩进微调。',
      },
      {
        index: '05',
        title: '目录跳转与书签',
        description: '按章节目录快速定位，用书签留住想反复重读的段落。',
      },
      {
        index: '06',
        title: '手势翻页与语音朗读',
        description: '兼容键盘快捷键与触控翻页，需要时可一键开启语音朗读。',
      },
    ],
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
              功能
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
            <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-1 rounded-[1px] bg-primary"
              />
              <span>自托管电子书阅读器</span>
            </p>
            <h1 className="entry-title landing-title mt-4">
              <span className="sr-only">Z Reader </span>
              你的私人书库<br />打开就是上次那页
            </h1>
            <p className="mt-5 max-w-[28rem] text-pretty text-base leading-7 text-subtle-foreground sm:mt-6 sm:text-[17px] sm:leading-8">
              把 EPUB、MOBI、AZW3 与 PDF 收在同一处，在手机、平板和电脑上安静续读。
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
                阅读特性
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

          <div className="w-full max-w-[38rem] lg:justify-self-end">
            <ReaderDeskPreview />
          </div>
        </section>

        <section
          id="features"
          className="scroll-mt-8 border-t border-border bg-surface-subtle py-16 sm:py-20 lg:py-24"
        >
          <div className="app-container grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,2.15fr)] lg:gap-16 xl:gap-20">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <p className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-1 rounded-[1px] bg-primary"
                />
                <span>卷目 · 01—06</span>
              </p>
              <h2 className="entry-title mt-3 text-2xl sm:text-3xl">
                书库与阅读
              </h2>
              <p className="mt-4 max-w-xs text-pretty text-sm leading-6 text-subtle-foreground">
                从整理藏书到调整中文排版，把干扰留在书页之外。
              </p>
            </div>

            <div className="space-y-12">
              {featureGroups.map((group) => (
                <div key={group.chapter}>
                  <div className="mb-2 flex items-baseline gap-2.5 text-xs text-muted-foreground">
                    <span className="font-heading text-sm text-primary">{group.chapter}</span>
                    <span className="font-medium text-foreground">{group.heading}</span>
                  </div>
                  <ol className="border-t border-border">
                    {group.items.map((item) => (
                      <li key={item.index} className="entry-catalog-row">
                        <span
                          aria-hidden="true"
                          className="font-mono text-xs leading-6 text-muted-foreground tabular-nums"
                        >
                          {item.index}
                        </span>
                        <h3 className="text-[15px] font-medium leading-6 text-foreground">
                          {item.title}
                        </h3>
                        <p className="text-pretty text-sm leading-6 text-subtle-foreground sm:col-start-2 lg:col-start-3">
                          {item.description}
                        </p>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
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
