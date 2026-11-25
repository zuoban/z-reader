import { useRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@/test/render';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ReaderTTSControlTrigger } from '@/components/reader/ReaderTTSControlTrigger';
import type { ReaderTTSRuntimeState } from '@/components/reader/ReaderTTSRuntime';
import { useReaderControls } from '@/hooks/useReaderControls';
import { useReaderSheets } from '@/hooks/useReaderSheets';
import { useReaderTTSBridge } from '@/hooks/useReaderTTSBridge';
import type { ThemeColors } from '@/hooks/useReaderTheme';
import type { FoliateView } from '@/lib/types';

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
    currentMark: null,
    markIndex: -1,
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
  const viewRef = useRef<FoliateView | null>(null);
  const [showStatusBarSlot, setShowStatusBarSlot] = useState(true);
  const sheets = useReaderSheets();
  const tts = useReaderTTSBridge({
    viewRef,
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
          activeSlot: tts.sharedTTSControlsProps.activeSlot,
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
          sharedProps={tts.sharedTTSControlsProps}
        />
      </div>
      <div data-testid="slot-mobile">
        <ReaderTTSControlTrigger
          slot="mobile-menu"
          sharedProps={tts.sharedTTSControlsProps}
        />
      </div>
      {showStatusBarSlot && (
        <div data-testid="slot-status-bar">
          <ReaderTTSControlTrigger
            slot="status-bar"
            sharedProps={tts.sharedTTSControlsProps}
          />
        </div>
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
      activeSlot: string | null;
    };
  }

  it('opens only the clicked slot, closes TTS when Search opens via Cmd/Ctrl+F, and restores keyboard shortcuts afterwards', async () => {
    const onNext = vi.fn();
    const restoreCurrentHighlight = vi.fn();

    render(
      <ReaderTTSIntegrationHarness
        onNext={onNext}
        restoreCurrentHighlight={restoreCurrentHighlight}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'mount-runtime' }));

    // Open TTS from desktop toolbar slot
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
      activeSlot: 'desktop-toolbar',
    });

    // Reader navigation shortcuts are suppressed while TTS sheet is open
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onNext).not.toHaveBeenCalled();

    // Press Ctrl+F to open Search -> TTS closes cleanly and highlight restores
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(readSummary()).toMatchObject({
      ttsOpen: false,
      showSearch: true,
      hasSheetOpen: true,
      activeSlot: null,
    });
    expect(restoreCurrentHighlight).toHaveBeenCalledTimes(1);

    // Closing Search leaves all overlays closed so reader keyboard shortcuts work again
    fireEvent.click(screen.getByRole('button', { name: 'close-search' }));
    expect(readSummary()).toMatchObject({
      ttsOpen: false,
      showSearch: false,
      hasSheetOpen: false,
      activeSlot: null,
    });

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('resets ttsOpen and restores keyboard shortcuts if an expanded status-bar TTS trigger unmounts', async () => {
    const onNext = vi.fn();
    const restoreCurrentHighlight = vi.fn();

    render(
      <ReaderTTSIntegrationHarness
        onNext={onNext}
        restoreCurrentHighlight={restoreCurrentHighlight}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'mount-runtime' }));

    // Open TTS from status-bar slot
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
      activeSlot: 'status-bar',
    });

    // Unmount status-bar trigger (as happens when header chrome becomes visible)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle-status-bar' }));
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(readSummary()).toMatchObject({
      ttsOpen: false,
      hasSheetOpen: false,
      activeSlot: null,
    });
    expect(restoreCurrentHighlight).toHaveBeenCalledTimes(1);

    // Reader shortcuts must work again instead of remaining locked out
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
