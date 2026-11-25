import type { CSSProperties } from 'react';

const books = [
  { title: '西游记', author: '吴承恩', colorLight: '#37584b', colorDark: '#2d473d' },
  { title: '水浒传', author: '施耐庵', colorLight: '#81563d', colorDark: '#694531' },
  { title: '三国演义', author: '罗贯中', colorLight: '#465c6a', colorDark: '#384a56' },
];

export function LibraryPreview({ compact = false }: { compact?: boolean }) {
  return (
    <figure className={compact ? 'library-preview library-preview-compact' : 'library-preview'}>
      <figcaption className="preview-caption">
        书架示例
        <span>{books.length} 本</span>
      </figcaption>
      <ul role="list" className="mt-4 grid grid-cols-3 gap-3 sm:gap-4">
        {books.map((book) => (
          <li
            key={book.title}
            className="preview-cover book-cover-spine"
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
          </li>
        ))}
      </ul>
      {!compact && (
        <div className="mt-5 border-t border-border pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">阅读进度示例</p>
              <p className="mt-1 font-heading text-base font-semibold">
                西游记 · 第十四回
              </p>
            </div>
            <span className="text-sm font-medium text-primary tabular-nums">54%</span>
          </div>
          <div aria-hidden="true" className="mt-3 h-[2px] overflow-hidden rounded-full bg-border">
            <div className="h-full w-[54%] rounded-full bg-primary" />
          </div>
        </div>
      )}
    </figure>
  );
}
