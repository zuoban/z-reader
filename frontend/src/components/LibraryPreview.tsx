import type { CSSProperties } from 'react';
import { ArrowUpRight, BookOpen } from 'lucide-react';

const books = [
  { title: '西游记', author: '吴承恩', color: '#37584b' },
  { title: '水浒传', author: '施耐庵', color: '#9b724b' },
  { title: '三国演义', author: '罗贯中', color: '#627582' },
];

/** A decorative product illustration, shared by the landing and authentication pages. */
export function LibraryPreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className="library-preview" aria-hidden="true">
      <div className="mb-5 flex items-center justify-between border-b border-border pb-3.5">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <BookOpen className="h-4 w-4 text-primary" strokeWidth={1.5} />
          我的书架
        </div>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          3 本
        </span>
      </div>
      <div className="grid grid-cols-3 items-start gap-3 sm:gap-4">
        {books.map((book) => (
          <div key={book.title}>
            <div
              className="preview-cover book-cover-spine"
              style={{ '--cover-color': book.color } as CSSProperties}
            >
              <div className="relative z-10 flex flex-1 items-center justify-center px-1 text-center">
                <p className="font-heading text-[clamp(0.8rem,4.2cqi,1.35rem)] font-medium leading-snug">
                  {book.title}
                </p>
              </div>
              <span className="relative z-10 truncate text-[10px] opacity-80">
                {book.author}
              </span>
            </div>
            <p className="mt-2.5 truncate text-xs font-medium text-foreground">{book.title}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{book.author}</p>
          </div>
        ))}
      </div>
      {!compact && (
        <div className="mt-5 flex items-center gap-4 rounded-xl border border-border bg-surface-subtle p-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>上次读到</span>
              <span className="font-mono tabular-nums text-primary">54%</span>
            </div>
            <p className="mt-1 font-heading text-base font-medium text-foreground">
              西游记 · 第十四回
            </p>
            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-primary/12">
              <div className="h-full w-[54%] rounded-full bg-primary" />
            </div>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} />
          </span>
        </div>
      )}
    </div>
  );
}
