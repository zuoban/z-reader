import { fireEvent, render, screen, waitFor } from '@/test/render';
import { describe, expect, it, vi } from 'vitest';

import { ReaderBookmarksSheet } from '@/components/reader/ReaderBookmarksSheet';
import { ReaderTOCSheet } from '@/components/reader/ReaderTOCSheet';
import { PRESET_STYLES } from '@/hooks/useReaderTheme';
import type { Bookmark } from '@/lib/api';
import type { TOCItem } from '@/lib/types';

function createLongTOC(): TOCItem[] {
  return [
    {
      label: '第一卷 启程',
      href: 'vol-1.xhtml',
      subitems: [
        { label: '第一章 初遇', href: 'ch-1.xhtml' },
        { label: '第二章 暗潮', href: 'ch-2.xhtml' },
      ],
    },
    ...Array.from({ length: 9 }, (_, index) => ({
      label: `第${index + 3}章 旅途 ${index + 3}`,
      href: `ch-${index + 3}.xhtml`,
    })),
  ];
}

describe('ReaderTOCSheet', () => {
  it('hides chapter search for short TOCs and navigates on click', () => {
    const onGoTo = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ReaderTOCSheet
        open
        onOpenChange={onOpenChange}
        toc={[
          { label: '第一章 开篇', href: 'ch-1.xhtml' },
          { label: '第二章 尾声', href: 'ch-2.xhtml' },
        ]}
        bookTitle="短篇集"
        bookAuthor="测试作者"
        tocListRef={{ current: null }}
        currentChapter="第一章 开篇"
        currentChapterHref="ch-1.xhtml"
        uiScheme={PRESET_STYLES.sepia}
        triggerClassName="reader-chrome-btn"
        triggerStyle={{}}
        onLocateCurrent={vi.fn()}
        onGoTo={onGoTo}
      />,
    );

    expect(screen.queryByRole('searchbox', { name: '筛选目录章节' })).not.toBeInTheDocument();
    const currentItem = screen.getByRole('button', { name: /^第一章 开篇/ });
    expect(currentItem).toHaveAttribute('data-current-chapter', 'true');
    expect(currentItem).toHaveAttribute('aria-current', 'page');

    fireEvent.click(screen.getByRole('button', { name: '第二章 尾声' }));
    expect(onGoTo).toHaveBeenCalledWith('ch-2.xhtml');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('filters long TOCs with hierarchy, Escape clear, empty recovery, and locate reset', async () => {
    const onOpenChange = vi.fn();
    const onLocateCurrent = vi.fn();

    render(
      <ReaderTOCSheet
        open
        onOpenChange={onOpenChange}
        toc={createLongTOC()}
        bookTitle="长篇小说"
        bookAuthor=""
        tocListRef={{ current: null }}
        currentChapter="第一章 初遇"
        currentChapterHref="ch-1.xhtml"
        uiScheme={PRESET_STYLES.dark}
        triggerClassName="reader-chrome-btn"
        triggerStyle={{}}
        onLocateCurrent={onLocateCurrent}
        onGoTo={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '目录' });
    expect(dialog).toHaveStyle({
      '--reader-panel-accent': PRESET_STYLES.dark.link,
      '--reader-panel-danger': '#f08078',
    });

    const searchInput = screen.getByRole('searchbox', { name: '筛选目录章节' });
    fireEvent.change(searchInput, { target: { value: '暗潮' } });

    expect(screen.getByRole('button', { name: '第一卷 启程' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '第二章 暗潮' })).toBeInTheDocument();
    expect(screen.getByText('暗潮').tagName).toBe('MARK');
    expect(screen.queryByRole('button', { name: /^第一章 初遇/ })).not.toBeInTheDocument();
    expect(screen.getByText('2 / 12')).toBeInTheDocument();

    // Pressing Escape clears the active query without dismissing the drawer.
    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect(searchInput).toHaveValue('');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^第一章 初遇/ })).toBeInTheDocument();

    // Unmatched queries expose a direct clear action that returns focus to the input.
    fireEvent.change(searchInput, { target: { value: '不存在的章节' } });
    expect(screen.getByText('未找到匹配章节')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '清空筛选' }));
    expect(searchInput).toHaveValue('');
    expect(searchInput).toHaveFocus();
    expect(screen.getByRole('button', { name: /^第一章 初遇/ })).toBeInTheDocument();

    // Locating current chapter while filtered clears the filter first.
    fireEvent.change(searchInput, { target: { value: '旅途 9' } });
    expect(screen.queryByRole('button', { name: /^第一章 初遇/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '定位到当前章节：第一章 初遇' }));
    expect(searchInput).toHaveValue('');
    await waitFor(() => expect(onLocateCurrent).toHaveBeenCalledTimes(1));
  });
});

describe('ReaderBookmarksSheet', () => {
  it('offers a direct create action in the empty state', () => {
    const onCreate = vi.fn();

    render(
      <ReaderBookmarksSheet
        open
        onOpenChange={vi.fn()}
        bookmarks={[]}
        bookTitle="测试书籍"
        uiScheme={PRESET_STYLES.green}
        triggerClassName="reader-chrome-btn"
        triggerStyle={{}}
        canCreate
        isSaving={false}
        onCreate={onCreate}
        onGoTo={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '书签' });
    expect(dialog).toHaveStyle({
      '--reader-panel-accent': PRESET_STYLES.green.link,
      '--reader-panel-danger': '#c23b33',
    });

    fireEvent.click(screen.getByRole('button', { name: '添加当前位置' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('marks bookmark creation buttons as busy and disabled while saving', () => {
    render(
      <ReaderBookmarksSheet
        open
        onOpenChange={vi.fn()}
        bookmarks={[]}
        bookTitle="测试书籍"
        uiScheme={PRESET_STYLES.sepia}
        triggerClassName="reader-chrome-btn"
        triggerStyle={{}}
        canCreate
        isSaving
        onCreate={vi.fn()}
        onGoTo={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const headerAdd = screen.getByRole('button', { name: '添加当前书签' });
    expect(headerAdd).toBeDisabled();
    expect(headerAdd).toHaveAttribute('aria-busy', 'true');
    expect(headerAdd).toHaveTextContent('保存中…');
  });

  it('navigates and deletes bookmarks with distinct accessible labels', () => {
    const onGoTo = vi.fn();
    const onDelete = vi.fn();
    const onOpenChange = vi.fn();
    const bookmarks: Bookmark[] = [
      {
        id: 'bm-1',
        book_id: 'book-1',
        user_id: 'reader',
        cfi: 'epubcfi(/6/4!/4/2)',
        chapter: '第三章 风起',
        percentage: 42.5,
        note: '关键伏笔',
        created_at: new Date().toISOString(),
      },
    ];

    render(
      <ReaderBookmarksSheet
        open
        onOpenChange={onOpenChange}
        bookmarks={bookmarks}
        bookTitle="测试书籍"
        uiScheme={PRESET_STYLES.dark}
        triggerClassName="reader-chrome-btn"
        triggerStyle={{}}
        canCreate
        isSaving={false}
        onCreate={vi.fn()}
        onGoTo={onGoTo}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '删除书签：第三章 风起' }));
    expect(onDelete).toHaveBeenCalledWith('bm-1');
    expect(onGoTo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '打开书签：第三章 风起，42.5%' }));
    expect(onGoTo).toHaveBeenCalledWith(bookmarks[0]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
