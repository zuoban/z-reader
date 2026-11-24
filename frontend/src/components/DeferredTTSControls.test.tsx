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
});
