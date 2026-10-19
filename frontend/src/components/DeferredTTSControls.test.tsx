import { fireEvent, render, screen } from '@testing-library/react';
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
});
