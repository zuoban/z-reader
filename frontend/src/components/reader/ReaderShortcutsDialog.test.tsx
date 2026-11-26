import { fireEvent, render, screen } from '@/test/render';
import { describe, expect, it, vi } from 'vitest';
import { ReaderShortcutsDialog } from '@/components/reader/ReaderShortcutsDialog';
import { PRESET_STYLES } from '@/hooks/useReaderTheme';

const uiScheme = PRESET_STYLES.light;

describe('ReaderShortcutsDialog', () => {
  it('does not render when closed', () => {
    render(
      <ReaderShortcutsDialog
        open={false}
        onOpenChange={vi.fn()}
        uiScheme={uiScheme}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders keyboard shortcuts when open', () => {
    render(
      <ReaderShortcutsDialog
        open
        onOpenChange={vi.fn()}
        uiScheme={uiScheme}
      />,
    );

    expect(screen.getByRole('dialog', { name: '键盘快捷键' })).toBeInTheDocument();
    expect(screen.getByText('翻页导航')).toBeInTheDocument();
    expect(screen.getByText('视图与浮层')).toBeInTheDocument();
    expect(screen.getByText('上一页')).toBeInTheDocument();
    expect(screen.getByText('下一页')).toBeInTheDocument();
    expect(screen.getByText('目录')).toBeInTheDocument();
    expect(screen.getByText('T')).toBeInTheDocument();
    expect(screen.getByText('书签')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('排版与外观')).toBeInTheDocument();
    expect(screen.getByText('S')).toBeInTheDocument();
    expect(screen.getByText('书内搜索')).toBeInTheDocument();
    expect(screen.getByText('⌘/Ctrl + F')).toBeInTheDocument();
    expect(screen.getByText('切换全屏')).toBeInTheDocument();
    expect(screen.getByText('图片预览缩放')).toBeInTheDocument();
    expect(screen.getByText('快捷键帮助')).toBeInTheDocument();
    expect(screen.getByText('退出全屏 / 关闭浮层 / 返回书库')).toBeInTheDocument();
    expect(screen.getByText('Shift + Space')).toBeInTheDocument();
    expect(screen.getByText('+')).toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('Esc')).toBeInTheDocument();
    expect(screen.getByRole('dialog').style.getPropertyValue('--reader-panel-bg')).toBe('#ffffff');
  });

  it('hides fullscreen shortcuts and narrows Escape hint when fullscreen is unsupported', () => {
    render(
      <ReaderShortcutsDialog
        open
        onOpenChange={vi.fn()}
        uiScheme={uiScheme}
        isFullscreenSupported={false}
        showBookmarksShortcut={false}
      />,
    );

    expect(screen.queryByText('切换全屏')).not.toBeInTheDocument();
    expect(screen.queryByText('F')).not.toBeInTheDocument();
    expect(screen.queryByText('书签')).not.toBeInTheDocument();
    expect(screen.queryByText('B')).not.toBeInTheDocument();
    expect(screen.queryByText('退出全屏 / 关闭浮层 / 返回书库')).not.toBeInTheDocument();
    expect(screen.getByText('关闭浮层 / 返回书库')).toBeInTheDocument();
  });

  it('closes via close button, backdrop click, and Escape key', () => {
    const onOpenChange = vi.fn();
    render(
      <ReaderShortcutsDialog
        open
        onOpenChange={onOpenChange}
        uiScheme={uiScheme}
      />,
    );

    // Clicking inside dialog panel does not close
    fireEvent.click(screen.getByRole('dialog'));
    expect(onOpenChange).not.toHaveBeenCalled();

    // Clicking close button closes dialog
    fireEvent.click(screen.getByRole('button', { name: '关闭快捷键帮助' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    // Pressing Escape closes dialog
    onOpenChange.mockClear();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);

    // Clicking backdrop presentation overlay closes dialog
    onOpenChange.mockClear();
    fireEvent.click(screen.getByRole('presentation'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('moves focus into dialog on open and restores focus on close', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open Shortcuts';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { rerender } = render(
      <ReaderShortcutsDialog
        open
        onOpenChange={vi.fn()}
        uiScheme={uiScheme}
      />,
    );

    await new Promise((resolve) => requestAnimationFrame(resolve));
    const closeButton = screen.getByRole('button', { name: '关闭快捷键帮助' });
    expect(document.activeElement).toBe(closeButton);

    // Tab wraps within dialog
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);

    rerender(
      <ReaderShortcutsDialog
        open={false}
        onOpenChange={vi.fn()}
        uiScheme={uiScheme}
      />,
    );
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
