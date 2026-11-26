import { fireEvent, render, screen, waitFor, within } from '@/test/render';
import { describe, expect, it, vi } from 'vitest';

import { ReaderToolbar } from '@/components/reader/ReaderToolbar';
import { PRESET_STYLES } from '@/hooks/useReaderTheme';

const uiScheme = PRESET_STYLES.light;

const baseToolbarProps = {
  visible: true,
  bookTitle: '测试书籍',
  bookAuthor: '',
  tocOpen: false,
  onTocOpenChange: vi.fn(),
  bookmarksOpen: false,
  onBookmarksOpenChange: vi.fn(),
  canCreateBookmark: true,
  isSavingBookmark: false,
  onCreateBookmark: vi.fn(),
  onBack: vi.fn(),
  uiScheme,
  headerSafeAreaPaddingTop: '0px',
  themeSettingsOpen: false,
  onThemeSettingsOpenChange: vi.fn(),
  isFullscreen: false,
  onToggleFullscreen: vi.fn(),
};

describe('ReaderToolbar', () => {
  it('places the read-aloud control immediately before settings', () => {
    render(
      <ReaderToolbar
        {...baseToolbarProps}
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
        {...baseToolbarProps}
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
    const props = {
      ...baseToolbarProps,
      bookTitle: '中国近代史',
      bookAuthor: '徐中约',
      onSaveOffline: vi.fn(),
      uiScheme: { ...uiScheme, bg: '#f8f7f4', cardBg: '#ffffff' },
    };

    const { container, rerender } = render(<ReaderToolbar {...props} />);

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
        {...props}
        isSavingOffline
        offlineDownloadLabel="42%"
      />,
    );

    expect(desktop.getByText('42%')).not.toHaveClass('sr-only');
    expect(desktop.getByRole('button', { name: '42%' })).toHaveAttribute('aria-busy', 'true');
  });

  it('closes the mobile actions menu and makes the header inert when hidden', () => {
    const props = {
      ...baseToolbarProps,
      isFullscreen: true,
    };

    const { container, rerender } = render(<ReaderToolbar {...props} />);
    const desktop = within(
      document.querySelector('[data-reader-toolbar-actions="desktop"]') as HTMLElement,
    );
    expect(desktop.getByRole('button', { name: '退出全屏' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByTitle('更多阅读操作'));
    expect(screen.getByRole('dialog', { name: '阅读操作' })).toBeInTheDocument();

    rerender(<ReaderToolbar {...props} visible={false} />);

    const header = container.querySelector('header.reader-chrome') as HTMLElement;
    expect(header).toHaveAttribute('aria-hidden', 'true');
    expect(header).toHaveAttribute('inert');
    expect(screen.queryByRole('dialog', { name: '阅读操作' })).not.toBeInTheDocument();

    rerender(<ReaderToolbar {...props} visible />);
    expect(header).not.toHaveAttribute('aria-hidden');
    expect(header).not.toHaveAttribute('inert');
    expect(screen.queryByRole('dialog', { name: '阅读操作' })).not.toBeInTheDocument();
  });

  it('hides fullscreen actions when unsupported and supports arrow-key navigation in the mobile menu', async () => {
    render(
      <ReaderToolbar
        {...baseToolbarProps}
        isFullscreenSupported={false}
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
    const onTocOpenChange = vi.fn();
    const onBookmarksOpenChange = vi.fn();
    const props = {
      ...baseToolbarProps,
      onTocOpenChange,
      onBookmarksOpenChange,
      ttsOpen: false,
    };

    const { container, rerender } = render(<ReaderToolbar {...props} />);

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
    expect(onTocOpenChange).toHaveBeenCalledWith(true);

    const bookmarksButton = desktop.getByTitle('书签');
    expect(bookmarksButton).toHaveAttribute('aria-expanded', 'false');
    expect(bookmarksButton).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(bookmarksButton);
    expect(onBookmarksOpenChange).toHaveBeenCalledWith(true);

    const mobileMenu = container.querySelector('.reader-toolbar-menu') as HTMLElement;
    expect(mobileMenu).toHaveAttribute('inert');

    const moreButton = screen.getByTitle('更多阅读操作');
    fireEvent.click(moreButton);
    expect(mobileMenu).not.toHaveAttribute('inert');

    moreButton.focus();
    fireEvent.keyDown(moreButton, { key: 'Escape' });
    expect(mobileMenu).toHaveAttribute('inert');

    fireEvent.click(moreButton);
    expect(mobileMenu).not.toHaveAttribute('inert');
    rerender(<ReaderToolbar {...props} ttsOpen />);
    expect(mobileMenu).toHaveAttribute('inert');
  });

  it('closes the mobile menu on outside pointerdown without stealing focus back to the trigger', async () => {
    const { container } = render(<ReaderToolbar {...baseToolbarProps} />);

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
    const props = {
      ...baseToolbarProps,
      searchOpen: false,
      onOpenSearch,
    };

    const { container, rerender } = render(<ReaderToolbar {...props} />);

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
    rerender(<ReaderToolbar {...props} searchOpen />);
    expect(screen.queryByRole('dialog', { name: '阅读操作' })).not.toBeInTheDocument();
  });

  it('renders quick preset switcher dots on desktop when onPresetChange is provided', () => {
    const onPresetChange = vi.fn();
    render(
      <ReaderToolbar
        {...baseToolbarProps}
        activePreset="light"
        onPresetChange={onPresetChange}
      />,
    );

    const group = screen.getByRole('group', { name: '快捷切换纸面' });
    const lightBtn = within(group).getByRole('button', { name: '切换为净白纸面' });
    const sepiaBtn = within(group).getByRole('button', { name: '切换为旧书纸面' });
    expect(lightBtn).toHaveAttribute('aria-pressed', 'true');
    expect(sepiaBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(sepiaBtn);
    expect(onPresetChange).toHaveBeenCalledWith('sepia');
  });
});
