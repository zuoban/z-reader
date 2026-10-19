import type { CSSProperties } from 'react';
import { ArrowUpRight, BookOpen } from 'lucide-react';

const books = [
  { title: '西游记', author: '吴承恩', color: '#37584b' },
  { title: '水浒传', author: '施耐庵', color: '#a67b4f' },
  { title: '三国演义', author: '罗贯中', color: '#647583' },
];

/** A decorative product illustration, shared by the landing and authentication pages. */
export function LibraryPreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className="library-preview" aria-hidden="true">
      <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <BookOpen className="h-4 w-4 text-primary" />
          我的书架
        </div>
        <span className="font-mono text-[9px] tracking-widest text-muted-foreground">
          MY LIBRARY / 03
        </span>
      </div>
      <div className="grid grid-cols-3 items-start gap-3 sm:gap-5">
        {books.map((book, index) => (
          <div key={book.title} className={index === 1 ? 'pt-5' : ''}>
            <div
              className="preview-cover book-cover-spine"
              style={{ '--cover-color': book.color } as CSSProperties}
            >
              <span className="absolute left-4 top-5 z-10 font-mono text-[7px] tracking-widest opacity-75">
                Z READER / 0{index + 1}
              </span>
              <div className="absolute inset-x-4 top-1/2 z-10 -translate-y-1/2">
                <p className="font-heading text-[clamp(0.75rem,4cqi,1.5rem)] font-semibold tracking-[0.04em]">
                  {book.title}
                </p>
              </div>
              <span className="absolute bottom-5 left-4 z-10 text-[9px] opacity-80">{book.author}</span>
            </div>
            <p className="mt-3 truncate text-xs font-medium">{book.title}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{book.author}</p>
          </div>
        ))}
      </div>
      {!compact && <div className="mt-6 flex items-center gap-4 rounded-lg bg-surface-subtle p-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold tracking-[0.12em] text-primary">继续上次的旅程</p>
          <p className="mt-1 font-heading text-lg font-semibold">西游记</p>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-primary/10">
            <div className="h-full w-[54%] rounded-full bg-primary" />
          </div>
          <p className="mt-2 text-[10px] tabular-nums text-muted-foreground">已读 54% · 阅读位置已同步</p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>}
    </div>
  );
}
