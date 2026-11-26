'use client';

import { useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';

const books = [
  {
    title: '西游记',
    author: '吴承恩',
    chapter: '第十四回',
    progress: 54,
    colorLight: '#37584b',
    colorDark: '#2d473d',
  },
  {
    title: '水浒传',
    author: '施耐庵',
    chapter: '第十回',
    progress: 28,
    colorLight: '#81563d',
    colorDark: '#694531',
  },
  {
    title: '三国演义',
    author: '罗贯中',
    chapter: '第三十八回',
    progress: 76,
    colorLight: '#465c6a',
    colorDark: '#384a56',
  },
] as const;

export function LibraryPreview() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeBook = books[activeIndex] ?? books[0];

  return (
    <figure>
      <figcaption className="preview-caption">
        <span>藏书示例</span>
        <span className="font-mono text-xs tabular-nums">{books.length} 卷</span>
      </figcaption>
      <ul role="list" className="mt-5 grid grid-cols-3 gap-3 sm:gap-4">
        {books.map((book, index) => {
          const isActive = index === activeIndex;
          return (
            <li key={book.title}>
              <button
                type="button"
                aria-pressed={isActive}
                onClick={() => setActiveIndex(index)}
                className={cn(
                  'preview-cover book-cover-spine w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  isActive && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
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
            </li>
          );
        })}
      </ul>
      <div className="mt-5 rounded-xl border border-border/80 bg-card/85 p-3.5 shadow-xs">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-xs font-medium text-foreground">
            {activeBook.title} · {activeBook.chapter}
          </p>
          <span className="shrink-0 font-mono text-xs font-medium text-primary tabular-nums">
            {activeBook.progress}%
          </span>
        </div>
        <div aria-hidden="true" className="mt-2 h-[3px] overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${activeBook.progress}%` }}
          />
        </div>
      </div>
    </figure>
  );
}
