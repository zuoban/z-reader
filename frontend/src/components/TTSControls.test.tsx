import { act, fireEvent, render, screen } from '@/test/render';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { TTSControls } from '@/components/TTSControls';
import type { ThemeColors } from '@/hooks/useReaderTheme';
import { FALLBACK_ZH_VOICES, type TTSSettings } from '@/lib/tts';
import type { TTSControlsProps } from '@/components/TTSControls';

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

const settings: TTSSettings = {
  voiceName: '',
  rate: 0,
  highlightMode: 'sentence',
};

describe('TTSControls', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
      writable: true,
    });
  });

  it('uses text-button sizing for a custom toolbar trigger', async () => {
    render(
      <TTSControls
        state="stopped"
        settings={settings}
        voices={[]}
        onStart={vi.fn()}
        onStop={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
        onUpdateSettings={vi.fn()}
        uiScheme={uiScheme}
        variant="toolbar"
        triggerClassName="toolbar-trigger"
        triggerStyle={{}}
        triggerContent={<span>朗读</span>}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: '朗读控制' })).not.toHaveClass('size-11');
  });

  function renderControls(overrides: Partial<TTSControlsProps> = {}) {
    const props = {
      state: 'stopped' as const, settings, voices: [],
      onStart: vi.fn(), onStop: vi.fn(), onNext: vi.fn(), onPrev: vi.fn(),
      onUpdateSettings: vi.fn(), uiScheme, initialExpanded: true, ...overrides,
    };
    return { ...render(<TTSControls {...props} />), props };
  }

  it.each(['floating', 'toolbar'] as const)(
    'allows Stop while the first start request is pending in %s controls', async (variant) => {
      let finishStart!: () => void;
      const start = new Promise<void>(resolve => { finishStart = resolve; });
      const { props } = renderControls({ variant, onStart: vi.fn(() => start) });
      fireEvent.click(screen.getByTitle('开始'));
      expect(screen.getByTitle('开始')).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByTitle('停止')).toBeEnabled();
      fireEvent.click(screen.getByTitle('停止'));
      expect(props.onStop).toHaveBeenCalledOnce();
      expect(screen.getByTitle('开始')).toBeEnabled();
      expect(screen.getByTitle('开始')).not.toHaveAttribute('aria-busy');

      await act(async () => { finishStart(); await start; });
      expect(screen.getByRole('dialog')).toBeVisible();
      expect(screen.getByTitle('开始')).toBeEnabled();
    },
  );

  it('keeps a newer start pending after an older cancelled request resolves', async () => {
    let finishOld!: () => void;
    let finishNew!: () => void;
    const oldStart = new Promise<void>(resolve => { finishOld = resolve; });
    const newStart = new Promise<void>(resolve => { finishNew = resolve; });
    const { props } = renderControls({ onStart: vi.fn()
      .mockReturnValueOnce(oldStart).mockReturnValueOnce(newStart) });
    fireEvent.click(screen.getByTitle('开始'));
    fireEvent.click(screen.getByTitle('停止'));
    fireEvent.click(screen.getByTitle('开始'));
    expect(props.onStart).toHaveBeenCalledTimes(2);
    await act(async () => { finishOld(); await oldStart; });
    expect(screen.getByTitle('开始')).toBeDisabled();
    expect(screen.getByRole('dialog')).toBeVisible();
    fireEvent.click(screen.getByTitle('停止'));
    await act(async () => { finishNew(); await newStart; });
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('allows cancelling a retry wait represented by preparing while stopped', () => {
    renderControls({ ...{ preparing: true } });
    expect(screen.getByTitle('开始')).toBeDisabled();
    expect(screen.getByTitle('开始')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTitle('停止')).toBeEnabled();
    fireEvent.click(screen.getByTitle('停止'));
  });

  it('exposes aria-expanded on the floating more settings toggle', () => {
    renderControls({ variant: 'floating' });
    const expandButton = screen.getByRole('button', { name: '更多设置' });
    expect(expandButton).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(expandButton);
    expect(screen.getByRole('button', { name: '收起设置' })).toHaveAttribute('aria-expanded', 'true');
  });

  it.each(['floating', 'toolbar'] as const)(
    'forwards the preview start callback through %s controls', async (variant) => {
      const onPreviewStart = vi.fn();
      vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
      try {
        renderControls({ variant, ...{ onPreviewStart } });
        if (variant === 'floating') fireEvent.click(screen.getByText('更多设置'));
        fireEvent.click(screen.getByRole('button', { name: '试听当前语音' }));
        expect(onPreviewStart).toHaveBeenCalledOnce();
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it('closes only the VoiceSelector dropdown on Escape without closing the toolbar drawer', async () => {
    renderControls({
      variant: 'toolbar',
      voices: FALLBACK_ZH_VOICES,
      settings: { ...settings, voiceName: FALLBACK_ZH_VOICES[0].ShortName },
    });

    expect(screen.getByRole('dialog')).toBeVisible();
    const voiceCombobox = screen.getByRole('combobox', { name: '语音' });
    fireEvent.click(voiceCombobox);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('listbox')).toBeVisible();

    const onWindowKeyDown = vi.fn();
    window.addEventListener('keydown', onWindowKeyDown);
    try {
      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      voiceCombobox.dispatchEvent(escapeEvent);
      await act(async () => {
        await Promise.resolve();
      });

      expect(escapeEvent.defaultPrevented).toBe(true);
      expect(onWindowKeyDown).not.toHaveBeenCalled();
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeVisible();
    } finally {
      window.removeEventListener('keydown', onWindowKeyDown);
    }
  });

  it('omits the empty floating status footer when no status is active', () => {
    const { rerender, props } = renderControls({ variant: 'floating' });
    expect(screen.queryByTestId('tts-floating-status-footer')).not.toBeInTheDocument();

    rerender(
      <TTSControls
        {...props}
        variant="floating"
        ttsStatus={{
          headline: '正在准备语音…',
          tone: 'active',
        }}
      />,
    );
    expect(screen.getByTestId('tts-floating-status-footer')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '更多设置' }));
    expect(screen.queryByTestId('tts-floating-status-footer')).not.toBeInTheDocument();
  });

  it.each(['floating', 'toolbar'] as const)(
    'prevents duplicate resume calls while resuming in %s controls',
    async (variant) => {
      let finishResume!: () => void;
      const resumePromise = new Promise<void>((resolve) => {
        finishResume = resolve;
      });
      const onResume = vi.fn(() => resumePromise);

      renderControls({
        variant,
        resumePromptVisible: true,
        resumePromptMessage: '切回应用后点击继续朗读。',
        onResume,
      });

      expect(screen.getByText('切回应用后点击继续朗读。')).toBeVisible();

      const resumeButton = screen.getByRole('button', { name: '继续' });
      fireEvent.click(resumeButton);
      expect(onResume).toHaveBeenCalledOnce();
      expect(resumeButton).toBeDisabled();
      expect(resumeButton).toHaveAttribute('aria-busy', 'true');
      expect(resumeButton).toHaveTextContent('恢复中…');

      fireEvent.click(resumeButton);
      expect(onResume).toHaveBeenCalledOnce();

      await act(async () => {
        finishResume();
        await resumePromise;
      });

      expect(resumeButton).toBeEnabled();
      expect(resumeButton).not.toHaveAttribute('aria-busy');
      expect(resumeButton).toHaveTextContent('继续');
    },
  );
});
