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
      const text = `第${i}段，` + '连续朗读的测试文本。'.repeat(3);
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
    expect(result.current.currentMark?.cfi).toBe('cfi-1');
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
    await waitFor(() => expect(result.current.resumePromptVisible).toBe(true), { timeout: 2500 });
    expect(backendTTS.hasEnded()).toBe(false);
    vi.mocked(fetch).mockResolvedValue(audioResponse());
    await act(() => result.current.resume());
    expect(result.current.currentMark?.cfi).toBe('cfi-1');
    expect(result.current.state).toBe('playing');
  });

  it('can skip backward and forward by sentence inside a longer chunk', async () => {
    const view = createView();
    const viewRef = { current: view };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    await act(() => result.current.start());
    await act(() => result.current.next());
    expect(result.current.currentMark?.cfi).toBe('cfi-1');
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

  it('navigates immediately while unrelated audio preloads are still pending', async () => {
    const viewRef = { current: createView() };
    let calls = 0;
    vi.mocked(fetch).mockImplementation(async (_url, options) => {
      calls++;
      if (calls === 2 || calls === 3) {
        return new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(
            Object.assign(new Error('cancelled'), { name: 'AbortError' }),
          ), { once: true });
        });
      }
      return audioResponse();
    });
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    await act(() => result.current.start());
    await waitFor(() => expect(calls).toBe(3));
    await act(async () => { void result.current.next(); await flushMediaEvents(); });
    await waitFor(() => expect(result.current.currentMark?.cfi).toBe('cfi-1'), {
      timeout: 400,
    });
    expect(TestAudio.instances.at(-1)?.paused).toBe(false);
  });

  it('retains audio and playback position when only highlight mode changes', async () => {
    const viewRef = { current: createView() };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    await act(() => result.current.start());
    const audio = TestAudio.instances.at(-1)!;
    await act(async () => { audio.tick(5); });
    const source = audio.src;
    await act(async () => {
      result.current.updateSettings({ highlightMode: 'sentence' });
      await flushMediaEvents();
    });
    expect(audio.src).toBe(source);
    expect(audio.currentTime).toBe(5);
    expect(viewRef.current.getTTSSentences).toHaveBeenCalledTimes(1);
  });

  it('does not rebuild or restart playback for unchanged settings', async () => {
    const viewRef = { current: createView() };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    await act(() => result.current.start());
    const audio = TestAudio.instances.at(-1)!;
    const source = audio.src;
    await act(async () => {
      result.current.updateSettings({ rate: result.current.settings.rate });
      await flushMediaEvents();
    });
    expect(audio.src).toBe(source);
    expect(viewRef.current.getTTSSentences).toHaveBeenCalledTimes(1);
  });

  it('offers recovery after exhausted request timeouts without losing the chunk', async () => {
    const viewRef = { current: createView() };
    vi.mocked(fetch).mockRejectedValue(Object.assign(new Error('timeout'), {
      name: 'TimeoutError',
    }));
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    await act(() => result.current.start());
    expect(result.current.state).toBe('paused');
    expect(result.current.resumePromptVisible).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
    vi.mocked(fetch).mockResolvedValue(audioResponse());
    await act(() => result.current.resume());
    expect(result.current.currentMark?.sentenceIndex).toBe(0);
    expect(result.current.state).toBe('playing');
  });

  it('reloads an expired previous sentence by CFI after skipping a long source sentence', async () => {
    const view = createView();
    view.getTTSSentences = vi.fn(async function* () {
      for (const [index, length] of [[0, 1000], [1, 100]] as const) {
        const text = '文'.repeat(length);
        yield { text, ssml: `<speak>${text}</speak>`, cfi: `cfi-${index}`,
          sectionIndex: 0, words: [] };
      }
    });
    view.getTTSPreviousCFI = vi.fn(async () => 'cfi-0');
    const viewRef = { current: view };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    await act(() => result.current.start());
    await act(() => result.current.next());
    await act(async () => { TestAudio.instances.at(-1)!.tick(20); });
    await act(() => result.current.prev());
    expect(view.getTTSSentences).toHaveBeenLastCalledWith('cfi-0');
    expect(result.current.state).toBe('playing');
  });
});
