import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { TTSControls } from '@/components/TTSControls';
import type { ThemeColors } from '@/hooks/useReaderTheme';
import type { TTSSettings } from '@/lib/tts';
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

  it('uses text-button sizing for a custom toolbar trigger', () => {
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
      expect(screen.getByTitle('停止')).toBeEnabled();
      fireEvent.click(screen.getByTitle('停止'));
      expect(props.onStop).toHaveBeenCalledOnce();
      expect(screen.getByTitle('开始')).toBeEnabled();

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
    expect(screen.getByTitle('停止')).toBeEnabled();
    fireEvent.click(screen.getByTitle('停止'));
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
});
