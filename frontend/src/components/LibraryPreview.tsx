import type { CSSProperties } from 'react';

const books = [
  { title: '西游记', author: '吴承恩', colorLight: '#37584b', colorDark: '#2d473d' },
  { title: '水浒传', author: '施耐庵', colorLight: '#81563d', colorDark: '#694531' },
  { title: '三国演义', author: '罗贯中', colorLight: '#465c6a', colorDark: '#384a56' },
];

export function LibraryPreview() {
  return (
    <figure>
      <figcaption className="preview-caption">
        <span>藏书示例</span>
        <span className="font-mono text-xs tabular-nums">{books.length} 卷</span>
      </figcaption>
      <ul role="list" className="mt-5 grid grid-cols-3 gap-3 sm:gap-4">
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
      <div className="mt-5 rounded-xl border border-border/80 bg-card/85 p-3.5 shadow-xs">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-xs font-medium text-foreground">
            西游记 · 第十四回
          </p>
          <span className="shrink-0 font-mono text-xs font-medium text-primary tabular-nums">54%</span>
        </div>
        <div aria-hidden="true" className="mt-2 h-[3px] overflow-hidden rounded-full bg-border">
          <div className="h-full w-[54%] rounded-full bg-primary" />
        </div>
      </div>
    </figure>
  );
}
