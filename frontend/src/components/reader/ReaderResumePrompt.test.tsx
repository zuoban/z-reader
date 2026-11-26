import { act, fireEvent, render, screen } from '@/test/render';
import { describe, expect, it, vi } from 'vitest';
import { ReaderResumePrompt } from '@/components/reader/ReaderResumePrompt';
import { PRESET_STYLES } from '@/hooks/useReaderTheme';

const uiScheme = { ...PRESET_STYLES.sepia, cardBg: '#fdfaf3' };

describe('ReaderResumePrompt', () => {
  it('renders status card with paper theme tokens and resumes on click', async () => {
    let resolveResume: (() => void) | null = null;
    const onResume = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveResume = resolve;
        }),
    );

    render(
      <ReaderResumePrompt
        message="轻触继续从上次位置朗读"
        uiScheme={uiScheme}
        onResume={onResume}
      />,
    );

    const statusRegion = screen.getByRole('status');
    expect(statusRegion).toHaveTextContent('朗读已暂停');
    expect(statusRegion).toHaveTextContent('轻触继续从上次位置朗读');
    expect(statusRegion).not.toHaveClass('sm:hidden');

    const card = statusRegion.querySelector('.reader-resume-card') as HTMLElement | null;
    expect(card?.style.getPropertyValue('--reader-panel-bg')).toBe('#fdfaf3');

    const resumeButton = screen.getByRole('button', { name: '继续' });
    fireEvent.click(resumeButton);

    expect(onResume).toHaveBeenCalledTimes(1);
    expect(resumeButton).toBeDisabled();
    expect(resumeButton).toHaveAttribute('aria-busy', 'true');
    expect(resumeButton).toHaveTextContent('恢复中…');

    // Second click while resuming is ignored
    fireEvent.click(resumeButton);
    expect(onResume).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveResume?.();
    });

    expect(resumeButton).not.toBeDisabled();
    expect(resumeButton).toHaveTextContent('继续');
  });
});
