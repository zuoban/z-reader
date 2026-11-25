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
  { id: 'light', label: '净白', swatch: '#f8f7f4', border: '#d8d5cd' },
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
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <figcaption className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">上次续读</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{activeBook.title}</span>
        </figcaption>

        <div
          role="group"
          aria-label="切换书页纸面"
          data-paper-mode={selectedPreset ?? 'auto'}
          className="flex items-center gap-1"
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
                  className="size-3 rounded-full border"
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

      <div className="mt-4 border-t border-border pt-4">
        <div className="mb-2.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>在读书架</span>
          <span>点击书封切换</span>
        </div>

        <ul role="list" className="grid grid-cols-3 gap-3 sm:gap-4">
          {PREVIEW_BOOKS.map((book) => {
            const isActive = book.id === activeBook.id;
            return (
              <li key={book.id}>
                <button
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setActiveBookId(book.id)}
                  className={cn(
                    'preview-cover preview-cover-interactive book-cover-spine w-full text-left',
                    isActive && 'preview-cover-active'
                  )}
                  style={
                    {
                      '--cover-color-light': book.colorLight,
                      '--cover-color-dark': book.colorDark,
                    } as CSSProperties
                  }
                >
                  <span
                    className="preview-cover-title"
                    data-long={book.title.length >= 4 ? 'true' : undefined}
                  >
                    {book.title}
                  </span>
                  <span className="preview-cover-author">{book.author}</span>
                </button>
                <div className="mt-2 flex items-center justify-between gap-1 px-0.5 text-xs">
                  <span
                    className={cn(
                      'truncate transition-colors',
                      isActive ? 'font-medium text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {book.title}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 tabular-nums transition-colors',
                      isActive ? 'font-medium text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {book.progress}%
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </figure>
  );
}
