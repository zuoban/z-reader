import { act, fireEvent, render, screen } from '@/test/render';
import { describe, expect, it, vi } from 'vitest';
import { ReaderResumePrompt } from '@/components/reader/ReaderResumePrompt';
import type { ThemeColors } from '@/hooks/useReaderTheme';

const uiScheme: ThemeColors = {
  bg: '#faf6ee',
  fg: '#2b2620',
  mutedText: '#7a7062',
  link: '#8a5a2b',
  headerBg: '#faf6ee',
  headerBorder: '#e2d9c8',
  cardBg: '#fdfaf3',
  cardBorder: '#dfd5c3',
  buttonBg: '#f0e8da',
  buttonHoverBg: '#e7dcc8',
  buttonText: '#2b2620',
  muted: '#f0e8da',
  accentText: '#8a5a2b',
};

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
