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

  it('allows Stop while the first start request is pending', async () => {
    let finishStart!: () => void;
    const start = new Promise<void>(resolve => { finishStart = resolve; });
    const { props } = renderControls({ onStart: vi.fn(() => start) });
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
  });

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

  it('forwards the preview start callback through toolbar controls', async () => {
    const onPreviewStart = vi.fn();
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    try {
      renderControls({ onPreviewStart });
      fireEvent.click(screen.getByRole('button', { name: '试听当前语音' }));
      expect(onPreviewStart).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('closes only the VoiceSelector dropdown on Escape without closing the toolbar drawer', async () => {
    renderControls({
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
      await act(async () => {
        voiceCombobox.dispatchEvent(escapeEvent);
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

  it('prevents duplicate resume calls while resuming', async () => {
    let finishResume!: () => void;
    const resumePromise = new Promise<void>((resolve) => {
      finishResume = resolve;
    });
    const onResume = vi.fn(() => resumePromise);

    renderControls({
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
  });

  it('announces TTS status errors as assertive alerts and normal updates as polite statuses', () => {
    const { rerender } = render(
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
        initialExpanded
        ttsStatus={{ headline: '朗读连接异常', detail: '正在重试', tone: 'error' }}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('朗读连接异常');
    expect(alert).toHaveAttribute('aria-live', 'assertive');

    rerender(
      <TTSControls
        state="playing"
        settings={settings}
        voices={[]}
        onStart={vi.fn()}
        onStop={vi.fn()}
        onNext={vi.fn()}
        onPrev={vi.fn()}
        onUpdateSettings={vi.fn()}
        uiScheme={uiScheme}
        initialExpanded
        ttsStatus={{ headline: '正在朗读', tone: 'active' }}
      />,
    );

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('正在朗读');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('calls onExpandedChange(false) when an expanded TTSControls instance unmounts', () => {
    const onExpandedChange = vi.fn();
    const { unmount } = renderControls({
      initialExpanded: true,
      onExpandedChange,
    });

    expect(onExpandedChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('dialog')).toBeVisible();

    unmount();

    expect(onExpandedChange).toHaveBeenLastCalledWith(false);
  });

  it('supports controlled expanded state and closes cleanly when parent sets expanded to false', () => {
    const onExpandedChange = vi.fn();
    const { rerender, props } = renderControls({
      expanded: true,
      initialExpanded: false,
      onExpandedChange,
    });

    expect(screen.getByRole('dialog')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '关闭朗读控制' }));
    expect(onExpandedChange).toHaveBeenCalledWith(false);

    rerender(
      <TTSControls
        {...props}
        expanded={false}
        initialExpanded={false}
        onExpandedChange={onExpandedChange}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
