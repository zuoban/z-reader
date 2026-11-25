import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@/test/render';
import { describe, expect, it, vi } from 'vitest';
import { DeferredTTSControls } from '@/components/DeferredTTSControls';
import type { TTSControlsProps } from '@/components/TTSControls';

vi.mock('@/components/TTSControls', () => ({
  TTSControls: ({ initialExpanded }: { initialExpanded: boolean }) => (
    <div role="dialog">{initialExpanded ? '打开朗读控制' : '关闭朗读控制'}</div>
  ),
}));

describe('DeferredTTSControls', () => {
  it('opens controls on the first click while keeping them mounted after activation', async () => {
    const onRequest = vi.fn();
    const props = {
      state: 'stopped', triggerClassName: 'reader-trigger',
      triggerContent: <span>朗读</span>,
    } as TTSControlsProps;
    const { rerender } = render(<DeferredTTSControls {...props} onRequest={onRequest} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '朗读控制' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('打开朗读控制');
    expect(onRequest).toHaveBeenCalledOnce();
    rerender(<DeferredTTSControls {...props} state="playing" onRequest={onRequest} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('keeps the icon trigger accessible and marks it busy while loading', async () => {
    const onRequest = vi.fn();
    const props = {
      state: 'stopped',
      triggerClassName: 'reader-trigger',
    } as TTSControlsProps;

    render(<DeferredTTSControls {...props} onRequest={onRequest} />);
    const button = screen.getByRole('button', { name: '朗读控制' });
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(button);
    expect(screen.getByRole('button', { name: '正在加载朗读控制' })).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(await screen.findByRole('dialog')).toHaveTextContent('打开朗读控制');
  });

  it('supports custom loadingContent for compact icon-only triggers', async () => {
    const onRequest = vi.fn();
    const props = {
      state: 'stopped',
      triggerClassName: 'reader-chrome-btn',
      triggerContent: <span className="sr-only">朗读</span>,
      loadingContent: <span className="sr-only">紧凑加载中</span>,
    } as TTSControlsProps & { loadingContent: ReactNode };

    render(<DeferredTTSControls {...props} onRequest={onRequest} />);
    fireEvent.click(screen.getByRole('button', { name: '朗读控制' }));

    expect(screen.getByText('紧凑加载中')).toHaveClass('sr-only');
    expect(screen.queryByText('加载中…')).not.toBeInTheDocument();
    expect(await screen.findByRole('dialog')).toHaveTextContent('打开朗读控制');
  });

  it('waits until runtimeReady is true before mounting TTSControls', async () => {
    const onRequest = vi.fn();
    const props = {
      state: 'stopped',
      triggerClassName: 'reader-trigger',
    } as TTSControlsProps;

    const { rerender } = render(
      <DeferredTTSControls {...props} onRequest={onRequest} runtimeReady={false} />
    );
    fireEvent.click(screen.getByRole('button', { name: '朗读控制' }));

    await Promise.resolve();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '正在加载朗读控制' })).toHaveAttribute(
      'aria-busy',
      'true'
    );

    rerender(<DeferredTTSControls {...props} onRequest={onRequest} runtimeReady />);
    expect(await screen.findByRole('dialog')).toHaveTextContent('打开朗读控制');
  });

  it('clears pending auto-open when controlled expanded becomes false while loading', async () => {
    const onRequest = vi.fn();
    const props = {
      state: 'stopped',
      triggerClassName: 'reader-trigger',
    } as TTSControlsProps;

    const { rerender } = render(
      <DeferredTTSControls
        {...props}
        expanded={false}
        onRequest={onRequest}
        runtimeReady={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '朗读控制' }));
    expect(onRequest).toHaveBeenCalledOnce();

    // Parent marks this slot active while loading
    rerender(
      <DeferredTTSControls
        {...props}
        expanded={true}
        onRequest={onRequest}
        runtimeReady={false}
      />,
    );
    expect(screen.getByRole('button', { name: '正在加载朗读控制' })).toHaveAttribute(
      'aria-busy',
      'true',
    );

    // Another sheet opens before runtimeReady -> parent clears expanded
    rerender(
      <DeferredTTSControls
        {...props}
        expanded={false}
        onRequest={onRequest}
        runtimeReady={false}
      />,
    );
    expect(screen.getByRole('button', { name: '朗读控制' })).not.toHaveAttribute('aria-busy');

    // Runtime finishes loading -> TTSControls mounts closed instead of auto-opening
    rerender(
      <DeferredTTSControls
        {...props}
        expanded={false}
        onRequest={onRequest}
        runtimeReady
      />,
    );
    expect(await screen.findByRole('dialog')).toHaveTextContent('关闭朗读控制');
  });

  it('resets expanded state if DeferredTTSControls unmounts while still loading', () => {
    const onRequest = vi.fn();
    const onExpandedChange = vi.fn();
    const props = {
      state: 'stopped',
      triggerClassName: 'reader-trigger',
    } as TTSControlsProps;

    const { unmount } = render(
      <DeferredTTSControls
        {...props}
        expanded={true}
        onExpandedChange={onExpandedChange}
        onRequest={onRequest}
        runtimeReady={false}
      />,
    );

    unmount();
    expect(onExpandedChange).toHaveBeenCalledWith(false);
  });
});
