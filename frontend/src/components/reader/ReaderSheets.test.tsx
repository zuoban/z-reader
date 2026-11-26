import { fireEvent, render, screen, waitFor } from '@/test/render';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { ReaderBookmarksSheet } from '@/components/reader/ReaderBookmarksSheet';
import { ReaderTOCSheet } from '@/components/reader/ReaderTOCSheet';
import { PRESET_STYLES } from '@/hooks/useReaderTheme';
import type { Bookmark } from '@/lib/api';
import * as bookmarksExport from '@/lib/bookmarks-export';
import type { TOCItem } from '@/lib/types';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

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

    // Pressing ArrowDown in the search input moves focus to the first matching chapter.
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: '第一卷 启程' })).toHaveFocus();

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

  it('enables locate-current when only currentChapterHref is known', () => {
    const onLocateCurrent = vi.fn();
    render(
      <ReaderTOCSheet
        open
        onOpenChange={vi.fn()}
        toc={[{ label: '第一章 开篇', href: 'ch-1.xhtml' }]}
        bookTitle="短篇集"
        bookAuthor=""
        tocListRef={{ current: null }}
        currentChapter=""
        currentChapterHref="ch-1.xhtml"
        uiScheme={PRESET_STYLES.light}
        onLocateCurrent={onLocateCurrent}
        onGoTo={vi.fn()}
      />,
    );

    const locateButton = screen.getByRole('button', { name: '定位到当前章节' });
    expect(locateButton).toBeEnabled();
    fireEvent.click(locateButton);
    expect(onLocateCurrent).toHaveBeenCalledTimes(1);
  });

  it('supports ArrowUp/ArrowDown/Home/End navigation across TOC chapters and back to search', () => {
    render(
      <ReaderTOCSheet
        open
        onOpenChange={vi.fn()}
        toc={createLongTOC()}
        bookTitle="长篇小说"
        bookAuthor=""
        tocListRef={{ current: null }}
        currentChapter="第一章 初遇"
        currentChapterHref="ch-1.xhtml"
        uiScheme={PRESET_STYLES.light}
        onLocateCurrent={vi.fn()}
        onGoTo={vi.fn()}
      />,
    );

    const searchInput = screen.getByRole('searchbox', { name: '筛选目录章节' });
    const firstChapter = screen.getByRole('button', { name: '第一卷 启程' });
    const secondChapter = screen.getByRole('button', { name: /^第一章 初遇/ });
    const lastChapter = screen.getByRole('button', { name: '第11章 旅途 11' });

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(firstChapter).toHaveFocus();

    fireEvent.keyDown(firstChapter, { key: 'ArrowDown' });
    expect(secondChapter).toHaveFocus();

    fireEvent.keyDown(secondChapter, { key: 'End' });
    expect(lastChapter).toHaveFocus();

    fireEvent.keyDown(lastChapter, { key: 'Home' });
    expect(firstChapter).toHaveFocus();

    fireEvent.keyDown(firstChapter, { key: 'ArrowUp' });
    expect(searchInput).toHaveFocus();
  });

  it('ignores IME composing Escape and restores focus to search input when Escape clears a query', () => {
    const onOpenChange = vi.fn();

    render(
      <ReaderTOCSheet
        open
        onOpenChange={onOpenChange}
        toc={createLongTOC()}
        bookTitle="测试书籍"
        bookAuthor="测试作者"
        tocListRef={{ current: null }}
        currentChapter="第一章 初遇"
        currentChapterHref="ch-1.xhtml"
        uiScheme={PRESET_STYLES.light}
        onLocateCurrent={vi.fn()}
        onGoTo={vi.fn()}
      />,
    );

    const searchInput = screen.getByRole('searchbox', { name: '筛选目录章节' });
    searchInput.focus();

    // Composing Escape with an empty query must not close the TOC drawer
    const composingEscape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(composingEscape, 'isComposing', { value: true });
    fireEvent(searchInput, composingEscape);
    expect(onOpenChange).not.toHaveBeenCalled();

    // Escape from the empty-state clear button clears the query and returns focus to search
    fireEvent.change(searchInput, { target: { value: '不存在的章节' } });
    const clearButton = screen.getByRole('button', { name: '清空筛选' });
    clearButton.focus();
    fireEvent.keyDown(clearButton, { key: 'Escape' });

    expect(searchInput).toHaveValue('');
    expect(searchInput).toHaveFocus();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('renders the progress scrubber, previews during pointer drag, commits fraction, and supports jump-back', () => {
    const onGoToFraction = vi.fn();
    const onReturnToPreviousLocation = vi.fn();

    const { rerender } = render(
      <ReaderTOCSheet
        open
        onOpenChange={vi.fn()}
        toc={[{ label: '第一章 开篇', href: 'ch-1.xhtml' }]}
        bookTitle="进度测试"
        bookAuthor=""
        tocListRef={{ current: null }}
        currentChapter="第一章 开篇"
        currentChapterHref="ch-1.xhtml"
        uiScheme={PRESET_STYLES.sepia}
        onLocateCurrent={vi.fn()}
        onGoTo={vi.fn()}
        percentage={32.5}
        onGoToFraction={onGoToFraction}
      />,
    );

    expect(screen.getByText('阅读进度')).toBeInTheDocument();
    expect(screen.getByText('32.5%')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /返回原位/ })).not.toBeInTheDocument();

    const slider = screen.getByRole('slider', { name: '跳转阅读进度' });
    expect(slider).toHaveValue('32.5');
    expect(slider).toHaveAttribute('aria-valuetext', '32.5%');

    // Pointer drag updates live preview without committing until pointer release
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '68' } });
    expect(screen.getByText('68.0%')).toBeInTheDocument();
    expect(slider).toHaveAttribute('aria-valuetext', '68.0%');
    expect(onGoToFraction).not.toHaveBeenCalled();

    fireEvent.pointerUp(slider);
    expect(onGoToFraction).toHaveBeenCalledTimes(1);
    expect(onGoToFraction).toHaveBeenCalledWith(0.68);

    // Keyboard / direct change commits immediately with 0..1 fraction
    fireEvent.change(slider, { target: { value: '45.5' } });
    expect(onGoToFraction).toHaveBeenCalledTimes(2);
    expect(onGoToFraction).toHaveBeenLastCalledWith(0.455);

    // Jump-back button renders when previous location is available
    rerender(
      <ReaderTOCSheet
        open
        onOpenChange={vi.fn()}
        toc={[{ label: '第一章 开篇', href: 'ch-1.xhtml' }]}
        bookTitle="进度测试"
        bookAuthor=""
        tocListRef={{ current: null }}
        currentChapter="第一章 开篇"
        currentChapterHref="ch-1.xhtml"
        uiScheme={PRESET_STYLES.dark}
        onLocateCurrent={vi.fn()}
        onGoTo={vi.fn()}
        percentage={68}
        onGoToFraction={onGoToFraction}
        jumpBackPercentage={32.5}
        onReturnToPreviousLocation={onReturnToPreviousLocation}
      />,
    );

    const returnButton = screen.getByRole('button', { name: /返回原位/ });
    expect(returnButton).toHaveAttribute('title', '返回跳转前位置 (32.5%)');
    fireEvent.click(returnButton);
    expect(onReturnToPreviousLocation).toHaveBeenCalledTimes(1);
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

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('hides markdown export and copy actions when there are no bookmarks', () => {
    render(
      <ReaderBookmarksSheet
        open
        onOpenChange={vi.fn()}
        bookmarks={[]}
        bookTitle="测试书籍"
        bookAuthor="测试作者"
        uiScheme={PRESET_STYLES.light}
        canCreate
        isSaving={false}
        onCreate={vi.fn()}
        onGoTo={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: '导出 Markdown' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '复制 Markdown' })).not.toBeInTheDocument();
  });

  it('exports and copies bookmarks as Markdown with toast feedback', async () => {
    const downloadSpy = vi
      .spyOn(bookmarksExport, 'downloadMarkdownFile')
      .mockImplementation(() => {});
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const bookmarks: Bookmark[] = [
      {
        id: 'bm-1',
        book_id: 'book-1',
        user_id: 'reader',
        cfi: 'epubcfi(/6/4!/4/2)',
        chapter: '第一章 开篇',
        percentage: 15.2,
        note: '第一段摘录',
        created_at: '2026-05-01T10:00:00.000Z',
      },
    ];

    render(
      <ReaderBookmarksSheet
        open
        onOpenChange={vi.fn()}
        bookmarks={bookmarks}
        bookTitle="红楼梦"
        bookAuthor="曹雪芹"
        uiScheme={PRESET_STYLES.sepia}
        canCreate
        isSaving={false}
        onCreate={vi.fn()}
        onGoTo={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '导出 Markdown' }));
    expect(downloadSpy).toHaveBeenCalledTimes(1);
    expect(downloadSpy.mock.calls[0][0]).toBe('红楼梦-书签.md');
    expect(downloadSpy.mock.calls[0][1]).toContain('# 红楼梦');
    expect(downloadSpy.mock.calls[0][1]).toContain('> 作者：曹雪芹');
    expect(downloadSpy.mock.calls[0][1]).toContain('第一段摘录');
    expect(toast.success).toHaveBeenCalledWith('已导出 Markdown 书签');

    fireEvent.click(screen.getByRole('button', { name: '复制 Markdown' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
      expect(toast.success).toHaveBeenCalledWith('已复制 Markdown 书签');
    });
    expect(writeText.mock.calls[0][0]).toContain('# 红楼梦');

    fireEvent.click(screen.getByRole('button', { name: '复制 Markdown' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('复制失败，请重试');
    });
  });

  it('supports inline bookmark note editing with save success, saving state, and cancel', async () => {
    let resolveSave!: (value: boolean) => void;
    const onUpdateNote = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const bookmarks: Bookmark[] = [
      {
        id: 'bm-1',
        book_id: 'book-1',
        user_id: 'reader',
        cfi: 'epubcfi(/6/4!/4/2)',
        chapter: '第三章 风起',
        percentage: 42.5,
        note: '原始备注',
        created_at: new Date().toISOString(),
      },
    ];

    const { rerender } = render(
      <ReaderBookmarksSheet
        open
        onOpenChange={vi.fn()}
        bookmarks={bookmarks}
        bookTitle="测试书籍"
        uiScheme={PRESET_STYLES.sepia}
        canCreate
        isSaving={false}
        onCreate={vi.fn()}
        onGoTo={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: '编辑书签备注：第三章 风起' }),
    ).not.toBeInTheDocument();

    rerender(
      <ReaderBookmarksSheet
        open
        onOpenChange={vi.fn()}
        bookmarks={bookmarks}
        bookTitle="测试书籍"
        uiScheme={PRESET_STYLES.sepia}
        canCreate
        isSaving={false}
        onCreate={vi.fn()}
        onGoTo={vi.fn()}
        onDelete={vi.fn()}
        onUpdateNote={onUpdateNote}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '编辑书签备注：第三章 风起' }));

    const textarea = screen.getByRole('textbox', { name: '书签备注' });
    expect(textarea).toHaveValue('原始备注');
    expect(textarea).toHaveAttribute('placeholder', '添加阅读笔记或摘录…');
    expect(textarea).toHaveAttribute('maxlength', '10240');
    expect(screen.getByText('第三章 风起')).toBeInTheDocument();
    expect(screen.getByText('42.5%')).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: '取消的修改' } });
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('textbox', { name: '书签备注' })).not.toBeInTheDocument();
    expect(onUpdateNote).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '编辑书签备注：第三章 风起' }));
    const editTextarea = screen.getByRole('textbox', { name: '书签备注' });
    fireEvent.change(editTextarea, { target: { value: '更新后的笔记' } });

    const saveButton = screen.getByRole('button', { name: '保存' });
    fireEvent.click(saveButton);

    expect(onUpdateNote).toHaveBeenCalledWith('bm-1', '更新后的笔记');
    expect(saveButton).toBeDisabled();
    expect(saveButton).toHaveAttribute('aria-busy', 'true');

    resolveSave(true);
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: '书签备注' })).not.toBeInTheDocument();
    });
  });

  it('retains draft on save failure and handles Ctrl+Enter, Meta+Enter, and Escape shortcuts', async () => {
    const onOpenChange = vi.fn();
    const onUpdateNote = vi
      .fn<(bookmarkId: string, note: string) => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const bookmarks: Bookmark[] = [
      {
        id: 'bm-1',
        book_id: 'book-1',
        user_id: 'reader',
        cfi: 'epubcfi(/6/4!/4/2)',
        chapter: '',
        percentage: 18,
        note: '',
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
        canCreate
        isSaving={false}
        onCreate={vi.fn()}
        onGoTo={vi.fn()}
        onDelete={vi.fn()}
        onUpdateNote={onUpdateNote}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '编辑书签备注：未识别章节' }));
    const textarea = screen.getByRole('textbox', { name: '书签备注' });
    fireEvent.change(textarea, { target: { value: '暂存草稿' } });

    // Ctrl+Enter submits; failure keeps edit form open with draft intact
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    await waitFor(() => {
      expect(onUpdateNote).toHaveBeenNthCalledWith(1, 'bm-1', '暂存草稿');
      expect(screen.getByRole('button', { name: '保存' })).not.toBeDisabled();
    });
    expect(screen.getByRole('textbox', { name: '书签备注' })).toHaveValue('暂存草稿');

    // Escape cancels editing without closing the drawer
    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: '书签备注' })).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();

    // Meta+Enter submits and closes edit form on success
    fireEvent.click(screen.getByRole('button', { name: '编辑书签备注：未识别章节' }));
    const secondTextarea = screen.getByRole('textbox', { name: '书签备注' });
    fireEvent.change(secondTextarea, { target: { value: '快捷键保存' } });
    fireEvent.keyDown(secondTextarea, { key: 'Enter', metaKey: true });
    await waitFor(() => {
      expect(onUpdateNote).toHaveBeenNthCalledWith(2, 'bm-1', '快捷键保存');
      expect(screen.queryByRole('textbox', { name: '书签备注' })).not.toBeInTheDocument();
    });
  });

  it('resets inline editing when drawer closes or edited bookmark is deleted', () => {
    const onUpdateNote = vi.fn();
    const bookmarks: Bookmark[] = [
      {
        id: 'bm-1',
        book_id: 'book-1',
        user_id: 'reader',
        cfi: 'epubcfi(/6/4!/4/2)',
        chapter: '第一章',
        percentage: 10,
        note: '笔记一',
        created_at: new Date().toISOString(),
      },
    ];

    const baseProps = {
      onOpenChange: vi.fn(),
      bookTitle: '测试书籍',
      uiScheme: PRESET_STYLES.light,
      triggerClassName: 'reader-chrome-btn',
      triggerStyle: {},
      canCreate: true,
      isSaving: false,
      onCreate: vi.fn(),
      onGoTo: vi.fn(),
      onDelete: vi.fn(),
      onUpdateNote,
    };

    const { rerender } = render(
      <ReaderBookmarksSheet {...baseProps} open bookmarks={bookmarks} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '编辑书签备注：第一章' }));
    expect(screen.getByRole('textbox', { name: '书签备注' })).toBeInTheDocument();

    // Closing and reopening clears editing state
    rerender(<ReaderBookmarksSheet {...baseProps} open={false} bookmarks={bookmarks} />);
    rerender(<ReaderBookmarksSheet {...baseProps} open bookmarks={bookmarks} />);
    expect(screen.queryByRole('textbox', { name: '书签备注' })).not.toBeInTheDocument();

    // Deleting the bookmark being edited clears editing state
    fireEvent.click(screen.getByRole('button', { name: '编辑书签备注：第一章' }));
    expect(screen.getByRole('textbox', { name: '书签备注' })).toBeInTheDocument();
    rerender(<ReaderBookmarksSheet {...baseProps} open bookmarks={[]} />);
    rerender(<ReaderBookmarksSheet {...baseProps} open bookmarks={bookmarks} />);
    expect(screen.queryByRole('textbox', { name: '书签备注' })).not.toBeInTheDocument();
  });

  it('sorts bookmarks by reading position and filters to entries with notes', () => {
    const bookmarks: Bookmark[] = [
      {
        id: 'bm-late-early-time',
        book_id: 'book-1',
        user_id: 'reader',
        cfi: 'epubcfi(/6/8!/4/2)',
        chapter: '第八章 尾声',
        percentage: 80,
        note: '结尾心得',
        created_at: '2026-05-03T10:00:00.000Z',
      },
      {
        id: 'bm-early-pos',
        book_id: 'book-1',
        user_id: 'reader',
        cfi: 'epubcfi(/6/2!/4/2)',
        chapter: '第一章 序曲',
        percentage: 12,
        note: '',
        created_at: '2026-05-02T10:00:00.000Z',
      },
    ];

    render(
      <ReaderBookmarksSheet
        open
        onOpenChange={vi.fn()}
        bookmarks={bookmarks}
        bookTitle="测试书籍"
        uiScheme={PRESET_STYLES.light}
        canCreate
        isSaving={false}
        onCreate={vi.fn()}
        onGoTo={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const getRenderedOrder = () =>
      screen
        .getAllByRole('button', { name: /^打开书签：/ })
        .map((button) => button.getAttribute('aria-label'));

    // Default sort: newest created_at first
    expect(getRenderedOrder()).toEqual([
      '打开书签：第八章 尾声，80.0%',
      '打开书签：第一章 序曲，12.0%',
    ]);

    fireEvent.click(screen.getByRole('button', { name: '按进度' }));
    expect(getRenderedOrder()).toEqual([
      '打开书签：第一章 序曲，12.0%',
      '打开书签：第八章 尾声，80.0%',
    ]);

    fireEvent.click(screen.getByRole('button', { name: /有笔记/ }));
    expect(getRenderedOrder()).toEqual(['打开书签：第八章 尾声，80.0%']);
  });

  it('jumps to quick progress milestone fractions from the TOC footer', () => {
    const onGoToFraction = vi.fn();

    render(
      <ReaderTOCSheet
        open
        onOpenChange={vi.fn()}
        toc={createLongTOC()}
        bookTitle="测试书籍"
        bookAuthor="作者"
        tocListRef={{ current: null }}
        currentChapter="第一章 初遇"
        currentChapterHref="ch-1.xhtml"
        uiScheme={PRESET_STYLES.light}
        onLocateCurrent={vi.fn()}
        onGoTo={vi.fn()}
        percentage={24}
        onGoToFraction={onGoToFraction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '跳转到 50%' }));
    expect(onGoToFraction).toHaveBeenCalledWith(0.5);
  });
});
