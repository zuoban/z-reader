import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    expect(moreButton.closest('.sm\\:hidden')).toBeInTheDocument();
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
});
