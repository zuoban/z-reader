import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTTS } from '@/hooks/useTTS';
import { backendTTS } from '@/lib/tts';
import { audioResponse, flushMediaEvents, installTestAudio, TestAudio } from '@/test/tts-audio';
import type { FoliateView, TTSSentence } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  requestWakeLock: vi.fn(async () => {}), releaseWakeLock: vi.fn(async () => {}),
  loadVoices: vi.fn(async () => {}),
}));
vi.mock('@/lib/api', () => ({ getAuthHeaders: () => ({}), handleAuthResponse: () => {} }));
vi.mock('@/hooks/useWakeLock', () => ({ useWakeLock: () => mocks }));
vi.mock('@/hooks/useTTSVoices', () => ({ useTTSVoices: () => ({
  voices: [], voicesLoading: false, voicesError: null, loadVoices: mocks.loadVoices,
}) }));

function createView() {
  const getTTSSentences = vi.fn(async function* (): AsyncGenerator<TTSSentence> {
    for (let i = 0; i < 20; i++) {
      const text = `第${i}段，` + '连续朗读的测试文本。'.repeat(10);
      yield { text, ssml: `<speak>${text}</speak>`, cfi: `cfi-${i}`,
        sectionIndex: Math.floor(i / 2), words: [] };
    }
  });
  return { getTTSSentences, lastLocation: { cfi: 'cfi-start' },
    renderer: { getContents: vi.fn(() => []), nextSection: vi.fn(), scrollToAnchor: vi.fn() },
  } as unknown as FoliateView;
}

describe('continuous TTS session', () => {
  let actions: Map<string, MediaSessionActionHandler | null>;
  beforeEach(() => {
    localStorage.clear();
    installTestAudio();
    vi.stubGlobal('fetch', vi.fn(async () => audioResponse()));
    Object.defineProperty(document, 'visibilityState', { value: 'visible' });
    actions = new Map();
    Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: {
      metadata: null, playbackState: 'none',
      setActionHandler: vi.fn((action, handler) => actions.set(action, handler)),
    } });
  });
  afterEach(() => {
    backendTTS.stop();
    backendTTS.clearPreload();
    vi.unstubAllGlobals();
    Object.defineProperty(document, 'visibilityState', { value: 'visible' });
  });

  it('continues buffered audio while hidden without navigating the reader', async () => {
    const view = createView();
    const viewRef = { current: view };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    await act(() => result.current.start());
    await waitFor(() => expect(backendTTS.getPreloadQueueLength()).toBeGreaterThan(0));
    const audio = TestAudio.instances.at(-1)!;
    const sources = audio.sources.length;
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      audio.finish();
      await flushMediaEvents();
    });
    await waitFor(() => expect(audio.sources.length).toBe(sources + 1));
    expect(audio.paused).toBe(false);
    expect(view.renderer?.nextSection).not.toHaveBeenCalled();
    expect(view.renderer?.scrollToAnchor).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('z-reader-tts-session:book')!).cfi).toBe('cfi-1');
  });

  it('does not resume an explicit pause when the page becomes visible again', async () => {
    const view = createView();
    const viewRef = { current: view };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    await act(() => result.current.start());
    await act(() => result.current.start());
    const audio = TestAudio.instances.at(-1)!;
    const plays = audio.playCalls;
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      await flushMediaEvents();
    });
    expect(result.current.state).toBe('paused');
    expect(audio.playCalls).toBe(plays);
    await act(() => result.current.resume());
    expect(audio.paused).toBe(false);
  });

  it('recovers an external pause without replaying the current chunk', async () => {
    const view = createView();
    const viewRef = { current: view };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    await act(() => result.current.start());
    const audio = TestAudio.instances.at(-1)!;
    const sources = audio.sources.length;
    await act(async () => { audio.tick(10); audio.pause(); await flushMediaEvents(); });
    expect(result.current.state).toBe('paused');
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('pageshow'));
      await flushMediaEvents();
    });
    expect(audio.paused).toBe(false);
    expect(audio.currentTime).toBe(10);
    expect(audio.sources).toHaveLength(sources);
  });

  it('treats the lock-screen play action as idempotent instead of a pause toggle', async () => {
    const view = createView();
    const viewRef = { current: view };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    await act(() => result.current.start());
    await act(async () => { actions.get('play')?.({ action: 'play' }); await flushMediaEvents(); });
    expect(result.current.state).toBe('playing');
    expect(TestAudio.instances.at(-1)?.paused).toBe(false);
  });

  it('preserves the session on a permission interruption without skipping to another sentence', async () => {
    const view = createView();
    const viewRef = { current: view };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    await act(() => result.current.start());
    await waitFor(() => expect(backendTTS.getPreloadQueueLength()).toBeGreaterThan(0));
    const audio = TestAudio.instances.at(-1)!;
    audio.playError = new DOMException('Blocked', 'NotAllowedError');
    await act(async () => { audio.finish(); await flushMediaEvents(); });
    await waitFor(() => expect(result.current.resumePromptVisible).toBe(true));
    expect(result.current.state).toBe('paused');
    expect(localStorage.getItem('z-reader-tts-session:book')).not.toBeNull();
    audio.playError = null;
    await act(() => result.current.resume());
    expect(result.current.currentMark?.sentenceIndex).toBe(1);
  });

  it('cancels pending work when stopped and can start another session', async () => {
    const view = createView();
    const viewRef = { current: view };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    await act(() => result.current.start());
    await act(() => result.current.stop());
    await act(async () => { await flushMediaEvents(); });
    expect(result.current.state).toBe('stopped');
    expect(localStorage.getItem('z-reader-tts-session:book')).toBeNull();
    expect(TestAudio.instances.at(-1)?.paused).toBe(true);
    await act(() => result.current.start());
    expect(result.current.state).toBe('playing');
  });

  it('retries a failed chunk after a network interruption instead of using the prior ended state', async () => {
    const view = createView();
    const viewRef = { current: view };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    await act(() => result.current.start());
    await waitFor(() => expect(backendTTS.getPreloadQueueLength()).toBeGreaterThanOrEqual(2));
    await act(async () => { await flushMediaEvents(); });
    backendTTS.clearPreload();
    vi.mocked(fetch).mockRejectedValue(new TypeError('Offline'));
    const audio = TestAudio.instances.at(-1)!;
    await act(async () => { audio.finish(); await flushMediaEvents(); });
    await waitFor(() => expect(result.current.resumePromptVisible).toBe(true));
    expect(backendTTS.hasEnded()).toBe(false);
    vi.mocked(fetch).mockResolvedValue(audioResponse());
    await act(() => result.current.resume());
    expect(result.current.currentMark?.sentenceIndex).toBe(1);
    expect(result.current.state).toBe('playing');
  });

  it('can skip backward and forward by sentence inside a longer chunk', async () => {
    const view = createView();
    const viewRef = { current: view };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    await act(() => result.current.start());
    await act(() => result.current.next());
    expect(result.current.currentMark?.sentenceIndex).toBe(1);
    await act(() => result.current.prev());
    expect(result.current.currentMark?.sentenceIndex).toBe(0);
  });

  it('applies new speech settings from the saved spoken location', async () => {
    const view = createView();
    const viewRef = { current: view };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    await act(() => result.current.start());
    await act(async () => { result.current.updateSettings({ rate: 20 }); });
    await waitFor(() => expect(result.current.state).toBe('playing'));
    expect(view.getTTSSentences).toHaveBeenLastCalledWith('cfi-0');
    expect(backendTTS.getSettings().rate).toBe(20);
  });
});
