import { fireEvent, render, screen } from '@/test/render';
import { describe, expect, it, vi } from 'vitest';
import { ReaderStatusBar } from '@/components/reader/ReaderStatusBar';
import { PRESET_STYLES } from '@/hooks/useReaderTheme';

describe('ReaderStatusBar', () => {
  it('renders a minimal immersive footer trigger when toolbar is hidden', () => {
    const onToggleToolbar = vi.fn();
    render(
      <ReaderStatusBar
        percentage={12.34}
        currentChapter="第一章 开篇"
        currentPageLabel="3 / 12"
        safeAreaPaddingBottom="0px"
        uiScheme={PRESET_STYLES.light}
        isToolbarVisible={false}
        onToggleToolbar={onToggleToolbar}
        compactTrailingAction={<button type="button">朗读控制</button>}
      />,
    );

    const expandButton = screen.getByRole('button', { name: '展开操作栏' });
    expect(expandButton).toHaveAttribute('aria-pressed', 'false');
    expect(expandButton).toHaveTextContent('12.3%');
    expect(screen.queryByText('第一章 开篇')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '朗读控制' })).toBeInTheDocument();

    fireEvent.click(expandButton);
    expect(onToggleToolbar).toHaveBeenCalledTimes(1);
  });

  it('renders chapter, page label, and clamped hairline progress when toolbar is visible', () => {
    const onToggleToolbar = vi.fn();
    const { container } = render(
      <ReaderStatusBar
        percentage={142}
        currentChapter="前言"
        currentPageLabel="1/4"
        safeAreaPaddingBottom="0px"
        uiScheme={PRESET_STYLES.dark}
        isToolbarVisible
        onToggleToolbar={onToggleToolbar}
      />,
    );

    const collapseButton = screen.getByRole('button', { name: '收起顶部操作栏' });
    expect(collapseButton).toHaveAttribute('aria-pressed', 'true');
    expect(collapseButton).toHaveTextContent('100.0%');
    expect(screen.getByText('前言')).toHaveAttribute('title', '前言');
    expect(collapseButton).toHaveTextContent('1/4');

    const progressFill = container.querySelector('.reader-status-progress-fill');
    expect(progressFill).toHaveStyle({ width: '100%' });

    fireEvent.click(collapseButton);
    expect(onToggleToolbar).toHaveBeenCalledTimes(1);
  });
});
