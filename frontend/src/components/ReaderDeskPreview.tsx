'use client';

import { useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';

type PaperPreset = 'light' | 'sepia' | 'green' | 'dark';

interface PreviewBook {
  id: string;
  title: string;
  author: string;
  chapter: string;
  progress: number;
  remaining: string;
  colorLight: string;
  colorDark: string;
  paragraphs: readonly [string, string];
}

const PREVIEW_BOOKS: readonly PreviewBook[] = [
  {
    id: 'xiyouji',
    title: '西游记',
    author: '吴承恩',
    chapter: '第十四回 · 心猿归正',
    progress: 54,
    remaining: '约剩 12 分钟',
    colorLight: '#37584b',
    colorDark: '#2d473d',
    paragraphs: [
      '三藏闻言，满心欢喜，道：「徒弟呀，你姓什么？」猴王道：「我姓孙。」三藏道：「我与你起个法名，却好呼唤。」',
      '猴王道：「不劳师父费心，我已有了法名，叫做孙悟空。」三藏欢喜道：「正合我们的宗派，再与你起个混名，称为行者，好么？」',
    ],
  },
  {
    id: 'shuihuzhuan',
    title: '水浒传',
    author: '施耐庵',
    chapter: '第十回 · 风雪山神庙',
    progress: 28,
    remaining: '约剩 18 分钟',
    colorLight: '#81563d',
    colorDark: '#694531',
    paragraphs: [
      '正是严冬天气，彤云密布，朔风渐起，却早纷纷扬扬卷下一天大雪来。林冲和差拨两个在路上，又没买酒吃处，早来到草料场外。',
      '看时，一周遭有些黄土墙，两扇大门。推开看里面时，七八间草屋做着仓廒，四下里都是马草堆，中间两座草厅。',
    ],
  },
  {
    id: 'sanguoyanyi',
    title: '三国演义',
    author: '罗贯中',
    chapter: '第三十八回 · 隆中决策',
    progress: 76,
    remaining: '约剩 8 分钟',
    colorLight: '#465c6a',
    colorDark: '#384a56',
    paragraphs: [
      '玄德见孔明身长八尺，面如冠玉，头戴纶巾，身披鹤氅，飘飘然有神仙之概。玄德下拜曰：「汉室末胄，久闻先生大名，如雷贯耳。」',
      '孔明答礼曰：「南阳野人，疏懒性成，屡蒙将军枉临，不胜愧赧。」二人叙礼毕，分宾主而坐，童子献茶。',
    ],
  },
];

const PAPER_PRESETS: readonly {
  id: PaperPreset;
  label: string;
  swatch: string;
  border: string;
}[] = [
  { id: 'light', label: '净白', swatch: '#f7f5f0', border: '#d6d1c6' },
  { id: 'sepia', label: '旧书', swatch: '#f3ead7', border: '#cbb58d' },
  { id: 'green', label: '苔纸', swatch: '#e6ede1', border: '#b6c7b0' },
  { id: 'dark', label: '夜读', swatch: '#1c1b19', border: '#5a5852' },
];

export function ReaderDeskPreview() {
  const [activeBookId, setActiveBookId] = useState<string>(PREVIEW_BOOKS[0].id);
  const [selectedPreset, setSelectedPreset] = useState<PaperPreset | null>(null);

  const activeBook =
    PREVIEW_BOOKS.find((book) => book.id === activeBookId) ?? PREVIEW_BOOKS[0];

  return (
    <figure
      className="reader-desk-shell"
      aria-label="书页排版与书架续读示例"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5">
        <figcaption className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <span className="font-medium text-foreground">{activeBook.title}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">{activeBook.author}</span>
        </figcaption>

        <div
          role="group"
          aria-label="切换书页纸面"
          data-paper-mode={selectedPreset ?? 'auto'}
          className="flex items-center gap-0.5 rounded-full border border-border/70 bg-surface-subtle p-0.5"
        >
          {PAPER_PRESETS.map((preset) => {
            const isSelected = selectedPreset === preset.id;
            const defaultFor =
              preset.id === 'light' || preset.id === 'dark' ? preset.id : undefined;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={selectedPreset ? isSelected : undefined}
                data-default-for={defaultFor}
                onClick={() => setSelectedPreset(preset.id)}
                className={cn(
                  'reader-desk-swatch-btn',
                  isSelected && 'reader-desk-swatch-btn-active'
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-3 rounded-full border shadow-xs"
                  style={{
                    backgroundColor: preset.swatch,
                    borderColor: preset.border,
                  }}
                />
                <span>{preset.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="reader-desk-page"
        data-paper-preset={selectedPreset ?? 'auto'}
      >
        <span aria-hidden="true" className="reader-desk-bookmark" />

        <div key={activeBook.id} className="paper-fade-content">
          <div className="reader-desk-page-header">
            <span className="font-heading text-xs">{activeBook.title}</span>
            <span className="truncate text-xs">{activeBook.chapter}</span>
          </div>

          <div className="reader-desk-excerpt">
            {activeBook.paragraphs.map((paragraph, index) => (
              <p key={`${activeBook.id}-${index}`}>{paragraph}</p>
            ))}
          </div>

          <div className="reader-desk-page-footer">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="tabular-nums">
                已读 <strong className="reader-desk-progress-num">{activeBook.progress}%</strong>
              </span>
              <span className="tabular-nums">{activeBook.remaining}</span>
            </div>
            <div aria-hidden="true" className="reader-desk-progress-track">
              <div
                className="reader-desk-progress-fill"
                style={{ width: `${activeBook.progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-1">
        <ul role="list" className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="示例藏书切换">
          {PREVIEW_BOOKS.map((book) => {
            const isActive = book.id === activeBook.id;
            return (
              <li key={book.id}>
                <button
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setActiveBookId(book.id)}
                  className={cn(
                    'reader-desk-book-tab',
                    isActive && 'reader-desk-book-tab-active'
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="reader-desk-book-swatch book-cover-spine"
                    style={
                      {
                        '--cover-color-light': book.colorLight,
                        '--cover-color-dark': book.colorDark,
                      } as CSSProperties
                    }
                  />
                  <span className="min-w-0 flex-1 text-left">
                    <span
                      className={cn(
                        'block truncate text-xs leading-4 transition-colors',
                        isActive ? 'font-medium text-foreground' : 'text-subtle-foreground'
                      )}
                    >
                      {book.title}
                    </span>
                    <span
                      className={cn(
                        'mt-0.5 block text-[11px] leading-4 tabular-nums transition-colors',
                        isActive ? 'font-medium text-primary' : 'text-muted-foreground'
                      )}
                    >
                      {book.progress}%
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </figure>
  );
}
