import { fireEvent, render, screen } from '@/test/render';
import { describe, expect, it, vi } from 'vitest';
import {
  ReaderAuthLoading,
  ReaderErrorState,
  ReaderLoadingOverlay,
} from '@/components/reader/ReaderStateViews';
import type { ThemeColors } from '@/hooks/useReaderTheme';

const darkUiScheme: ThemeColors = {
  bg: '#161616',
  fg: '#e6e2da',
  mutedText: '#9d978c',
  link: '#d29c64',
  headerBg: '#161616',
  headerBorder: '#2c2a26',
  cardBg: '#1f1e1c',
  cardBorder: '#33302b',
  buttonBg: '#2b2926',
  buttonHoverBg: '#36332e',
  buttonText: '#e6e2da',
  muted: '#2b2926',
  accentText: '#d29c64',
};

describe('ReaderStateViews', () => {
  it('renders ReaderAuthLoading with paper card theme variables', () => {
    render(<ReaderAuthLoading uiScheme={darkUiScheme} />);

    const status = screen.getByRole('status', { name: '正在验证登录' });
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('验证登录…')).toBeInTheDocument();

    const card = status.querySelector('.reader-state-card') as HTMLElement | null;
    expect(card?.style.getPropertyValue('--reader-panel-bg')).toBe('#1f1e1c');
  });

  it('renders ReaderErrorState with dark-safe danger token and action handlers', () => {
    const onBack = vi.fn();
    const onRetry = vi.fn();

    const { rerender } = render(
      <ReaderErrorState
        error="当前处于离线状态，本书尚未保存到离线缓存"
        uiScheme={darkUiScheme}
        onBack={onBack}
        onRetry={onRetry}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert.style.getPropertyValue('--reader-panel-danger')).toBe('#f08078');
    expect(screen.getByText('无法打开本书')).toBeInTheDocument();
    expect(
      screen.getByText('当前处于离线状态，本书尚未保存到离线缓存'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重试连接' }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '返回书库' }));
    expect(onBack).toHaveBeenCalledTimes(1);

    rerender(
      <ReaderErrorState
        error="网络异常"
        uiScheme={darkUiScheme}
        onBack={onBack}
        onRetry={onRetry}
        isRetrying
      />,
    );

    const retryingButton = screen.getByRole('button', { name: '正在重新连接...' });
    expect(retryingButton).toBeDisabled();
    expect(retryingButton).toHaveAttribute('aria-busy', 'true');
  });

  it('renders ReaderLoadingOverlay with loading message and detail', () => {
    render(
      <ReaderLoadingOverlay
        loadingMsg="正在打开书籍…"
        loadingDetail="正在解析章节目录"
        readerContentInsetTop="3rem"
        statusBarReservedSpace="2.75rem"
        uiScheme={darkUiScheme}
      />,
    );

    const status = screen.getByRole('status', { name: '正在打开书籍…' });
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('正在打开书籍…')).toBeInTheDocument();
    expect(screen.getByText('正在解析章节目录')).toBeInTheDocument();

    const card = status.querySelector('.reader-state-card') as HTMLElement | null;
    expect(card?.style.getPropertyValue('--reader-panel-bg')).toBe('#1f1e1c');
  });
});
