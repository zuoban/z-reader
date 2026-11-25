import { fireEvent, render, screen, waitFor, within } from '@/test/render';
import { describe, expect, it, vi } from 'vitest';

import { ReaderToolbar } from '@/components/reader/ReaderToolbar';
import type { ReaderTheme, ThemeColors } from '@/hooks/useReaderTheme';

vi.mock('@/components/ThemeSettings', () => ({
  ThemeSettings: ({ trigger }: { trigger: React.ReactNode }) => (
    <button type="button">{trigger}</button>
  ),
}));

vi.mock('@/components/reader/ReaderBookmarksSheet', () => ({
  ReaderBookmarksSheet: ({ trigger }: { trigger: React.ReactNode }) => (
    <button type="button">{trigger}</button>
  ),
}));

vi.mock('@/components/reader/ReaderTOCSheet', () => ({
  ReaderTOCSheet: ({ trigger }: { trigger: React.ReactNode }) => (
    <button type="button">{trigger}</button>
  ),
}));

const uiScheme: ThemeColors = {
  bg: '#ffffff',
  fg: '#111111',
  mutedText: '#666666',
  link: '#0066cc',
  headerBg: '#ffffff',
  headerBorder: '#dddddd',
  cardBg: '#ffffff',
  cardBorder: '#dddddd',
  buttonBg: '#f5f5f5',
  buttonHoverBg: '#eeeeee',
  buttonText: '#111111',
  muted: '#f5f5f5',
  accentText: '#0066cc',
};

const theme: ReaderTheme = {
  preset: 'light',
  fontFamily: 'classic',
  fontSize: 18,
  lineHeight: 1.7,
  pagePaddingX: 24,
  pagePaddingY: 24,
  paragraphSpacing: 1,
  flow: 'paginated',
  maxInlineSize: 720,
  gap: 24,
  animated: true,
  chineseIndent: true,
  punctuationSqueeze: true,
};

describe('ReaderToolbar', () => {
  it('places the read-aloud control immediately before settings', () => {
    render(
      <ReaderToolbar
        visible
        bookTitle="测试书籍"
        bookAuthor=""
        toc={[]}
        tocOpen={false}
        onTocOpenChange={vi.fn()}
        bookmarksOpen={false}
        onBookmarksOpenChange={vi.fn()}
        bookmarks={[]}
        canCreateBookmark
        isSavingBookmark={false}
        onCreateBookmark={vi.fn()}
        onGoToBookmark={vi.fn()}
        onDeleteBookmark={vi.fn()}
        tocListRef={{ current: null }}
        currentChapter=""
        currentChapterHref=""
        onLocateCurrentChapter={vi.fn()}
        onGoTo={vi.fn()}
        onBack={vi.fn()}
        uiScheme={uiScheme}
        headerSafeAreaPaddingTop="0px"
        theme={theme}
        setTheme={vi.fn()}
        themeSettingsOpen={false}
        onThemeSettingsOpenChange={vi.fn()}
        isFullscreen={false}
        onToggleFullscreen={vi.fn()}
        ttsControls={
          <button type="button">
            <span>朗读</span>
          </button>
        }
      />,
    );

    const desktopActions = document.querySelector('[data-reader-toolbar-actions="desktop"]');
    expect(desktopActions).toBeInTheDocument();

    const desktop = within(desktopActions as HTMLElement);
    const add = desktop.getByText('添加');
    const readAloud = desktop.getByText('朗读');
    const settings = desktop.getByText('设置');

    expect(add.compareDocumentPosition(readAloud)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(readAloud.compareDocumentPosition(settings)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('collapses reader actions behind a mobile overflow trigger', async () => {
    const { container } = render(
      <ReaderToolbar
        visible
        bookTitle="测试书籍"
        bookAuthor=""
        toc={[]}
        tocOpen={false}
        onTocOpenChange={vi.fn()}
        bookmarksOpen={false}
        onBookmarksOpenChange={vi.fn()}
        bookmarks={[]}
        canCreateBookmark
        isSavingBookmark={false}
        onCreateBookmark={vi.fn()}
        onGoToBookmark={vi.fn()}
        onDeleteBookmark={vi.fn()}
        tocListRef={{ current: null }}
        currentChapter=""
        currentChapterHref=""
        onLocateCurrentChapter={vi.fn()}
        onGoTo={vi.fn()}
        onBack={vi.fn()}
        uiScheme={uiScheme}
        headerSafeAreaPaddingTop="0px"
        theme={theme}
        setTheme={vi.fn()}
        themeSettingsOpen={false}
        onThemeSettingsOpenChange={vi.fn()}
        isFullscreen={false}
        onToggleFullscreen={vi.fn()}
        ttsControls={
          <button type="button">
            <span>朗读</span>
          </button>
        }
        mobileTtsControls={
          <button type="button">
            <span>朗读</span>
          </button>
        }
      />,
    );

    const moreButton = screen.getByTitle('更多阅读操作');
    expect(moreButton.closest('.lg\\:hidden')).toBeInTheDocument();
    expect(container.querySelector('[data-reader-toolbar-actions="desktop"]')).toHaveClass('hidden');

    fireEvent.click(moreButton);

    expect(screen.getByText('阅读操作')).toBeInTheDocument();
    const mobileActions = screen.getByRole('dialog', { name: '阅读操作' });
    expect(mobileActions).toBeInTheDocument();
    await waitFor(() => expect(within(mobileActions).getByRole('button', { name: '目录' })).toHaveFocus());

    fireEvent.keyDown(mobileActions, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: '阅读操作' })).not.toBeInTheDocument();
    await waitFor(() => expect(moreButton).toHaveFocus());
  });

  it('blends the header into the paper background and keeps desktop actions icon-quiet until offline saving', () => {
    const { container, rerender } = render(
      <ReaderToolbar
        visible
        bookTitle="中国近代史"
        bookAuthor="徐中约"
        toc={[]}
        tocOpen={false}
        onTocOpenChange={vi.fn()}
        bookmarksOpen={false}
        onBookmarksOpenChange={vi.fn()}
        bookmarks={[]}
        canCreateBookmark
        isSavingBookmark={false}
        onCreateBookmark={vi.fn()}
        onGoToBookmark={vi.fn()}
        onDeleteBookmark={vi.fn()}
        onSaveOffline={vi.fn()}
        tocListRef={{ current: null }}
        currentChapter=""
        currentChapterHref=""
        onLocateCurrentChapter={vi.fn()}
        onGoTo={vi.fn()}
        onBack={vi.fn()}
        uiScheme={{ ...uiScheme, bg: '#f8f7f4', cardBg: '#ffffff' }}
        headerSafeAreaPaddingTop="0px"
        theme={theme}
        setTheme={vi.fn()}
        themeSettingsOpen={false}
        onThemeSettingsOpenChange={vi.fn()}
        isFullscreen={false}
        onToggleFullscreen={vi.fn()}
      />,
    );

    const header = container.querySelector('header.reader-chrome') as HTMLElement;
    expect(header.style.getPropertyValue('--reader-chrome-bg')).toBe('#f8f7f4');
    expect(header.style.getPropertyValue('--reader-chrome-menu-bg')).toBe('#ffffff');
    expect(screen.getByText('· 徐中约')).toBeInTheDocument();

    const desktop = within(
      document.querySelector('[data-reader-toolbar-actions="desktop"]') as HTMLElement,
    );
    expect(desktop.getByText('离线')).toHaveClass('sr-only');

    rerender(
      <ReaderToolbar
        visible
        bookTitle="中国近代史"
        bookAuthor="徐中约"
        toc={[]}
        tocOpen={false}
        onTocOpenChange={vi.fn()}
        bookmarksOpen={false}
        onBookmarksOpenChange={vi.fn()}
        bookmarks={[]}
        canCreateBookmark
        isSavingBookmark={false}
        onCreateBookmark={vi.fn()}
        onGoToBookmark={vi.fn()}
        onDeleteBookmark={vi.fn()}
        onSaveOffline={vi.fn()}
        isSavingOffline
        offlineDownloadLabel="42%"
        tocListRef={{ current: null }}
        currentChapter=""
        currentChapterHref=""
        onLocateCurrentChapter={vi.fn()}
        onGoTo={vi.fn()}
        onBack={vi.fn()}
        uiScheme={{ ...uiScheme, bg: '#f8f7f4', cardBg: '#ffffff' }}
        headerSafeAreaPaddingTop="0px"
        theme={theme}
        setTheme={vi.fn()}
        themeSettingsOpen={false}
        onThemeSettingsOpenChange={vi.fn()}
        isFullscreen={false}
        onToggleFullscreen={vi.fn()}
      />,
    );

    expect(desktop.getByText('42%')).not.toHaveClass('sr-only');
    expect(desktop.getByRole('button', { name: '42%' })).toHaveAttribute('aria-busy', 'true');
  });

  it('closes the mobile actions menu and makes the header inert when hidden', () => {
    const baseProps = {
      visible: true,
      bookTitle: '测试书籍',
      bookAuthor: '',
      toc: [],
      tocOpen: false,
      onTocOpenChange: vi.fn(),
      bookmarksOpen: false,
      onBookmarksOpenChange: vi.fn(),
      bookmarks: [],
      canCreateBookmark: true,
      isSavingBookmark: false,
      onCreateBookmark: vi.fn(),
      onGoToBookmark: vi.fn(),
      onDeleteBookmark: vi.fn(),
      tocListRef: { current: null },
      currentChapter: '',
      currentChapterHref: '',
      onLocateCurrentChapter: vi.fn(),
      onGoTo: vi.fn(),
      onBack: vi.fn(),
      uiScheme,
      headerSafeAreaPaddingTop: '0px',
      theme,
      setTheme: vi.fn(),
      themeSettingsOpen: false,
      onThemeSettingsOpenChange: vi.fn(),
      isFullscreen: true,
      onToggleFullscreen: vi.fn(),
    };

    const { container, rerender } = render(<ReaderToolbar {...baseProps} />);
    const desktop = within(
      document.querySelector('[data-reader-toolbar-actions="desktop"]') as HTMLElement,
    );
    expect(desktop.getByRole('button', { name: '退出全屏' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByTitle('更多阅读操作'));
    expect(screen.getByRole('dialog', { name: '阅读操作' })).toBeInTheDocument();

    rerender(<ReaderToolbar {...baseProps} visible={false} />);

    const header = container.querySelector('header.reader-chrome') as HTMLElement;
    expect(header).toHaveAttribute('aria-hidden', 'true');
    expect(header).toHaveAttribute('inert');
    expect(screen.queryByRole('dialog', { name: '阅读操作' })).not.toBeInTheDocument();

    rerender(<ReaderToolbar {...baseProps} visible />);
    expect(header).not.toHaveAttribute('aria-hidden');
    expect(header).not.toHaveAttribute('inert');
    expect(screen.queryByRole('dialog', { name: '阅读操作' })).not.toBeInTheDocument();
  });

  it('hides fullscreen actions when unsupported and supports arrow-key navigation in the mobile menu', async () => {
    render(
      <ReaderToolbar
        visible
        bookTitle="测试书籍"
        bookAuthor=""
        toc={[]}
        tocOpen={false}
        onTocOpenChange={vi.fn()}
        bookmarksOpen={false}
        onBookmarksOpenChange={vi.fn()}
        bookmarks={[]}
        canCreateBookmark
        isSavingBookmark={false}
        onCreateBookmark={vi.fn()}
        onGoToBookmark={vi.fn()}
        onDeleteBookmark={vi.fn()}
        tocListRef={{ current: null }}
        currentChapter=""
        currentChapterHref=""
        onLocateCurrentChapter={vi.fn()}
        onGoTo={vi.fn()}
        onBack={vi.fn()}
        uiScheme={uiScheme}
        headerSafeAreaPaddingTop="0px"
        theme={theme}
        setTheme={vi.fn()}
        themeSettingsOpen={false}
        onThemeSettingsOpenChange={vi.fn()}
        isFullscreenSupported={false}
        isFullscreen={false}
        onToggleFullscreen={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /全屏/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('更多阅读操作'));
    const mobileActions = screen.getByRole('dialog', { name: '阅读操作' });
    const tocButton = within(mobileActions).getByRole('button', { name: '目录' });
    const bookmarksButton = within(mobileActions).getByRole('button', { name: '书签' });
    const settingsButton = within(mobileActions).getByRole('button', { name: '设置' });

    await waitFor(() => expect(tocButton).toHaveFocus());

    fireEvent.keyDown(mobileActions, { key: 'ArrowDown' });
    expect(bookmarksButton).toHaveFocus();

    fireEvent.keyDown(mobileActions, { key: 'End' });
    expect(settingsButton).toHaveFocus();

    fireEvent.keyDown(mobileActions, { key: 'ArrowDown' });
    expect(tocButton).toHaveFocus();

    fireEvent.keyDown(mobileActions, { key: 'ArrowUp' });
    expect(settingsButton).toHaveFocus();
  });

  it('marks the closed mobile menu inert, closes on document Escape and TTS open, and exposes settings dialog ARIA', () => {
    const baseProps = {
      visible: true,
      bookTitle: '测试书籍',
      bookAuthor: '',
      toc: [],
      tocOpen: false,
      onTocOpenChange: vi.fn(),
      bookmarksOpen: false,
      onBookmarksOpenChange: vi.fn(),
      bookmarks: [],
      canCreateBookmark: true,
      isSavingBookmark: false,
      onCreateBookmark: vi.fn(),
      onGoToBookmark: vi.fn(),
      onDeleteBookmark: vi.fn(),
      tocListRef: { current: null },
      currentChapter: '',
      currentChapterHref: '',
      onLocateCurrentChapter: vi.fn(),
      onGoTo: vi.fn(),
      onBack: vi.fn(),
      uiScheme,
      headerSafeAreaPaddingTop: '0px',
      theme,
      setTheme: vi.fn(),
      themeSettingsOpen: false,
      onThemeSettingsOpenChange: vi.fn(),
      isFullscreen: false,
      onToggleFullscreen: vi.fn(),
      ttsOpen: false,
    };

    const { container, rerender } = render(<ReaderToolbar {...baseProps} />);

    const desktop = within(
      container.querySelector('[data-reader-toolbar-actions="desktop"]') as HTMLElement,
    );
    const settingsButton = desktop.getByTitle('阅读设置');
    expect(settingsButton).toHaveAttribute('aria-expanded', 'false');
    expect(settingsButton).toHaveAttribute('aria-haspopup', 'dialog');

    const tocButton = desktop.getByTitle('目录');
    expect(tocButton).toHaveAttribute('aria-expanded', 'false');
    expect(tocButton).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(tocButton);
    expect(baseProps.onTocOpenChange).toHaveBeenCalledWith(true);

    const bookmarksButton = desktop.getByTitle('书签');
    expect(bookmarksButton).toHaveAttribute('aria-expanded', 'false');
    expect(bookmarksButton).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(bookmarksButton);
    expect(baseProps.onBookmarksOpenChange).toHaveBeenCalledWith(true);

    const mobileMenu = container.querySelector('.reader-toolbar-menu') as HTMLElement;
    expect(mobileMenu).toHaveAttribute('inert');

    const moreButton = screen.getByTitle('更多阅读操作');
    fireEvent.click(moreButton);
    expect(mobileMenu).not.toHaveAttribute('inert');

    // Escape closes the menu even if focus returned to the trigger button
    moreButton.focus();
    fireEvent.keyDown(moreButton, { key: 'Escape' });
    expect(mobileMenu).toHaveAttribute('inert');

    // Opening TTS closes the mobile overflow menu cleanly
    fireEvent.click(moreButton);
    expect(mobileMenu).not.toHaveAttribute('inert');
    rerender(<ReaderToolbar {...baseProps} ttsOpen />);
    expect(mobileMenu).toHaveAttribute('inert');
  });

  it('closes the mobile menu on outside pointerdown without stealing focus back to the trigger', async () => {
    const { container } = render(
      <ReaderToolbar
        visible
        bookTitle="测试书籍"
        bookAuthor=""
        toc={[]}
        tocOpen={false}
        onTocOpenChange={vi.fn()}
        bookmarksOpen={false}
        onBookmarksOpenChange={vi.fn()}
        bookmarks={[]}
        canCreateBookmark
        isSavingBookmark={false}
        onCreateBookmark={vi.fn()}
        onGoToBookmark={vi.fn()}
        onDeleteBookmark={vi.fn()}
        tocListRef={{ current: null }}
        currentChapter=""
        currentChapterHref=""
        onLocateCurrentChapter={vi.fn()}
        onGoTo={vi.fn()}
        onBack={vi.fn()}
        uiScheme={uiScheme}
        headerSafeAreaPaddingTop="0px"
        theme={theme}
        setTheme={vi.fn()}
        themeSettingsOpen={false}
        onThemeSettingsOpenChange={vi.fn()}
        isFullscreen={false}
        onToggleFullscreen={vi.fn()}
      />,
    );

    const mobileMenu = container.querySelector('.reader-toolbar-menu') as HTMLElement;
    const moreButton = screen.getByTitle('更多阅读操作');
    const backButton = screen.getByRole('button', { name: '返回书库' });

    fireEvent.click(moreButton);
    expect(mobileMenu).not.toHaveAttribute('inert');

    backButton.focus();
    fireEvent.pointerDown(backButton);
    expect(mobileMenu).toHaveAttribute('inert');

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    expect(backButton).toHaveFocus();
    expect(moreButton).not.toHaveFocus();
  });

  it('renders desktop and mobile in-book search triggers when onOpenSearch is provided', () => {
    const onOpenSearch = vi.fn();
    const { container, rerender } = render(
      <ReaderToolbar
        visible
        bookTitle="测试书籍"
        bookAuthor=""
        toc={[]}
        tocOpen={false}
        onTocOpenChange={vi.fn()}
        bookmarksOpen={false}
        onBookmarksOpenChange={vi.fn()}
        bookmarks={[]}
        canCreateBookmark
        isSavingBookmark={false}
        onCreateBookmark={vi.fn()}
        onGoToBookmark={vi.fn()}
        onDeleteBookmark={vi.fn()}
        tocListRef={{ current: null }}
        currentChapter=""
        currentChapterHref=""
        onLocateCurrentChapter={vi.fn()}
        onGoTo={vi.fn()}
        onBack={vi.fn()}
        uiScheme={uiScheme}
        headerSafeAreaPaddingTop="0px"
        theme={theme}
        setTheme={vi.fn()}
        themeSettingsOpen={false}
        onThemeSettingsOpenChange={vi.fn()}
        isFullscreen={false}
        onToggleFullscreen={vi.fn()}
        searchOpen={false}
        onOpenSearch={onOpenSearch}
      />,
    );

    const desktop = within(
      container.querySelector('[data-reader-toolbar-actions="desktop"]') as HTMLElement,
    );
    const desktopSearch = desktop.getByRole('button', { name: '书内搜索' });
    expect(desktopSearch).toHaveAttribute('title', '书内搜索 (Ctrl/⌘+F)');
    expect(desktopSearch).toHaveAttribute('aria-expanded', 'false');
    expect(desktopSearch).toHaveAttribute('aria-haspopup', 'dialog');

    fireEvent.click(desktopSearch);
    expect(onOpenSearch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle('更多阅读操作'));
    const mobileActions = screen.getByRole('dialog', { name: '阅读操作' });
    fireEvent.click(within(mobileActions).getByRole('button', { name: '书内搜索' }));
    expect(onOpenSearch).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog', { name: '阅读操作' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('更多阅读操作'));
    expect(screen.getByRole('dialog', { name: '阅读操作' })).toBeInTheDocument();
    rerender(
      <ReaderToolbar
        visible
        bookTitle="测试书籍"
        bookAuthor=""
        toc={[]}
        tocOpen={false}
        onTocOpenChange={vi.fn()}
        bookmarksOpen={false}
        onBookmarksOpenChange={vi.fn()}
        bookmarks={[]}
        canCreateBookmark
        isSavingBookmark={false}
        onCreateBookmark={vi.fn()}
        onGoToBookmark={vi.fn()}
        onDeleteBookmark={vi.fn()}
        tocListRef={{ current: null }}
        currentChapter=""
        currentChapterHref=""
        onLocateCurrentChapter={vi.fn()}
        onGoTo={vi.fn()}
        onBack={vi.fn()}
        uiScheme={uiScheme}
        headerSafeAreaPaddingTop="0px"
        theme={theme}
        setTheme={vi.fn()}
        themeSettingsOpen={false}
        onThemeSettingsOpenChange={vi.fn()}
        isFullscreen={false}
        onToggleFullscreen={vi.fn()}
        searchOpen
        onOpenSearch={onOpenSearch}
      />,
    );
    expect(screen.queryByRole('dialog', { name: '阅读操作' })).not.toBeInTheDocument();
  });
});
