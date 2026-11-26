import { useRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@/test/render';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { TTSControls } from '@/components/TTSControls';
import { ReaderTTSControlTrigger } from '@/components/reader/ReaderTTSControlTrigger';
import type { ReaderTTSRuntimeState } from '@/components/reader/ReaderTTSRuntime';
import { useReaderControls } from '@/hooks/useReaderControls';
import { useReaderSheets } from '@/hooks/useReaderSheets';
import { useReaderTTSBridge } from '@/hooks/useReaderTTSBridge';
import type { ThemeColors } from '@/hooks/useReaderTheme';

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

function createRuntime(
  overrides: Partial<ReaderTTSRuntimeState> = {},
): ReaderTTSRuntimeState {
  return {
    state: 'stopped',
    preparing: false,
    settings: { rate: 1, voiceName: '', highlightMode: 'sentence' },
    voices: [],
    voicesLoading: false,
    voicesError: null,
    resumePromptVisible: false,
    resumePromptMessage: '',
    ttsStatus: { headline: '准备朗读', detail: '选择开始', tone: 'idle' },
    sleepTimer: { mode: 'off', label: '关闭' },
    updateSettings: vi.fn(),
    start: vi.fn(async () => {}),
    pause: vi.fn(),
    stop: vi.fn(),
    next: vi.fn(async () => {}),
    prev: vi.fn(async () => {}),
    reloadVoices: vi.fn(async () => {}),
    setSleepTimerForMinutes: vi.fn(),
    clearSleepTimer: vi.fn(),
    resume: vi.fn(async () => {}),
    restoreCurrentHighlight: vi.fn(),
    ...overrides,
  };
}

function ReaderTTSIntegrationHarness({
  onNext,
  restoreCurrentHighlight,
}: {
  onNext: () => void;
  restoreCurrentHighlight: () => void;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const [showStatusBarSlot, setShowStatusBarSlot] = useState(true);
  const sheets = useReaderSheets();
  const tts = useReaderTTSBridge({
    uiScheme,
    overlayContainer: null,
    hideHeader: vi.fn(),
    ttsOpen: sheets.ttsOpen,
    onTtsOpenChange: sheets.setTtsOpen,
  });

  useReaderControls({
    pageRef,
    onPrev: vi.fn(),
    onNext,
    onBack: vi.fn(),
    onStopTTS: tts.stopTTS,
    overlayOpen: sheets.hasSheetOpen,
    shortcutsOpen: sheets.shortcutsOpen,
    onToggleShortcuts: sheets.handleToggleShortcuts,
    onCloseShortcuts: sheets.handleCloseShortcuts,
    onOpenSearch: sheets.openSearch,
    onOpenTOC: () => sheets.setTocOpen(true),
  });

  const handleActivateRuntime = () => {
    tts.handleSyncTTSRuntime(createRuntime({ restoreCurrentHighlight }));
  };

  return (
    <div ref={pageRef} data-testid="reader-root">
      <div data-testid="state-summary">
        {JSON.stringify({
          ttsOpen: sheets.ttsOpen,
          showSearch: sheets.showSearch,
          tocOpen: sheets.tocOpen,
          hasSheetOpen: sheets.hasSheetOpen,
        })}
      </div>

      <button type="button" onClick={handleActivateRuntime}>
        mount-runtime
      </button>
      <button type="button" onClick={sheets.closeSearch}>
        close-search
      </button>
      <button type="button" onClick={() => sheets.setTocOpen(true)}>
        open-toc
      </button>
      <button type="button" onClick={() => sheets.setTocOpen(false)}>
        close-toc
      </button>
      <button type="button" onClick={() => setShowStatusBarSlot((v) => !v)}>
        toggle-status-bar
      </button>

      <div data-testid="slot-desktop">
        <ReaderTTSControlTrigger
          slot="desktop-toolbar"
          expanded={tts.ttsOpen}
          state={tts.ttsState}
          uiScheme={uiScheme}
          onClick={tts.requestTTS}
        />
      </div>
      <div data-testid="slot-mobile">
        <ReaderTTSControlTrigger
          slot="mobile-menu"
          expanded={tts.ttsOpen}
          state={tts.ttsState}
          uiScheme={uiScheme}
          onClick={tts.requestTTS}
        />
      </div>
      {showStatusBarSlot && (
        <div data-testid="slot-status-bar">
          <ReaderTTSControlTrigger
            slot="status-bar"
            expanded={tts.ttsOpen}
            state={tts.ttsState}
            uiScheme={uiScheme}
            onClick={tts.requestTTS}
          />
        </div>
      )}

      {tts.ttsRequested && tts.drawerProps && (
        <TTSControls {...tts.drawerProps} />
      )}
    </div>
  );
}

describe('useReaderTTSBridge + useReaderSheets coordination', () => {
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

  function readSummary() {
    return JSON.parse(screen.getByTestId('state-summary').textContent ?? '{}') as {
      ttsOpen: boolean;
      showSearch: boolean;
      tocOpen: boolean;
      hasSheetOpen: boolean;
    };
  }

  it('opens the TTS drawer, closes TTS when Search opens via Cmd/Ctrl+F, and restores keyboard shortcuts afterwards', async () => {
    const onNext = vi.fn();
    const restoreCurrentHighlight = vi.fn();

    render(
      <ReaderTTSIntegrationHarness
        onNext={onNext}
        restoreCurrentHighlight={restoreCurrentHighlight}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'mount-runtime' }));

    const desktopTrigger = screen
      .getByTestId('slot-desktop')
      .querySelector('button[data-reader-tts-trigger="true"]') as HTMLButtonElement;
    fireEvent.click(desktopTrigger);

    await waitFor(() => {
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
    });
    expect(readSummary()).toMatchObject({
      ttsOpen: true,
      showSearch: false,
      hasSheetOpen: true,
    });

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onNext).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(readSummary()).toMatchObject({
      ttsOpen: false,
      showSearch: true,
      hasSheetOpen: true,
    });
    expect(restoreCurrentHighlight).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'close-search' }));
    expect(readSummary()).toMatchObject({
      ttsOpen: false,
      showSearch: false,
      hasSheetOpen: false,
    });

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('keeps the TTS dialog open when a status-bar trigger unmounts and restores shortcuts on close', async () => {
    const onNext = vi.fn();
    const restoreCurrentHighlight = vi.fn();

    render(
      <ReaderTTSIntegrationHarness
        onNext={onNext}
        restoreCurrentHighlight={restoreCurrentHighlight}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'mount-runtime' }));

    const statusTrigger = screen
      .getByTestId('slot-status-bar')
      .querySelector('button[data-reader-tts-trigger="true"]') as HTMLButtonElement;
    fireEvent.click(statusTrigger);

    await waitFor(() => {
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
    });
    expect(readSummary()).toMatchObject({
      ttsOpen: true,
      hasSheetOpen: true,
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle-status-bar' }));
    });

    // Trigger unmount no longer closes the page-level TTS drawer unexpectedly
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(readSummary()).toMatchObject({
      ttsOpen: true,
      hasSheetOpen: true,
    });

    fireEvent.click(screen.getByRole('button', { name: '关闭朗读控制' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(readSummary()).toMatchObject({
      ttsOpen: false,
      hasSheetOpen: false,
    });
    expect(restoreCurrentHighlight).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
