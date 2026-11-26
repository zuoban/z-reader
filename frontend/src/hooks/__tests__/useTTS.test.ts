import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
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
    cleanup();
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

  it('refetches the current chunk on explicit resume and waits after repeated decode failure', async () => {
    const viewRef = { current: createView() };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    const requests = () => vi.mocked(fetch).mock.calls.map(([, options]) =>
      JSON.parse(String(options?.body)) as { ssml: string; refresh_audio?: boolean });
    await act(() => result.current.start());
    const [{ ssml }] = requests();
    const currentRequests = () => requests().filter(request => request.ssml === ssml);
    const audio = TestAudio.instances.at(-1)!;
    const fail = () => {
      audio.error = { code: 3 } as MediaError;
      audio.finish();
      audio.onerror?.();
    };
    const lifecycleEvents = async () => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('pageshow'));
      document.dispatchEvent(new Event('visibilitychange'));
      document.dispatchEvent(new Event('pointerup'));
      await flushMediaEvents();
    };

    await act(async () => { fail(); await lifecycleEvents(); });
    expect(result.current.state).toBe('paused');
    expect(result.current.resumePromptMessage).toContain('重新获取当前片段');
    expect(currentRequests()).toEqual([{ ssml, output_format: expect.any(String) }]);

    // Some browsers reject play() before delivering the corresponding error event.
    audio.playError = new DOMException('Cannot decode', 'NotSupportedError');
    try {
      await act(() => result.current.resume());
    } finally {
      audio.playError = null;
    }
    await act(lifecycleEvents);
    expect(result.current.state).toBe('paused');
    expect(result.current.resumePromptVisible).toBe(true);
    expect(result.current.ttsStatus.detail).toContain('重新获取的音频仍无法播放');
    expect(requests().filter(request => request.refresh_audio)).toEqual([
      { ssml, output_format: expect.any(String), refresh_audio: true },
    ]);
    expect(currentRequests()).toHaveLength(2);

    await act(() => result.current.resume());
    expect(result.current.state).toBe('playing');
    expect(result.current.resumePromptVisible).toBe(false);
    expect(result.current.currentMark?.cfi).toBe('cfi-0');
    expect(currentRequests()).toHaveLength(3);
    expect(currentRequests().at(-1)?.refresh_audio).toBe(true);
  });

  it('refreshes the SSML that actually failed after the invalid-SSML fallback', async () => {
    const view = createView();
    vi.mocked(view.getTTSSentences!).mockImplementation(async function* () {
      yield { text: '测试朗读。', ssml: '<speak><break time="1s"/>测试朗读。</speak>',
        cfi: 'cfi-0', sectionIndex: 0, words: [] };
    });
    const viewRef = { current: view };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ code: 'invalid_ssml' }), {
      status: 422,
    }));
    await act(() => result.current.start());
    const requests = () => vi.mocked(fetch).mock.calls.map(([, options]) =>
      JSON.parse(String(options?.body)) as { ssml: string; refresh_audio?: boolean });
    const [original, fallback] = requests();
    expect(fallback.ssml).not.toBe(original.ssml);
    const audio = TestAudio.instances.at(-1)!;
    act(() => {
      audio.error = { code: 3 } as MediaError;
      audio.onerror?.();
    });
    expect(backendTTS.hasAudio(fallback.ssml)).toBe(false);

    await act(() => result.current.resume());
    expect(requests().filter(request => request.refresh_audio)).toEqual([
      { ssml: fallback.ssml, output_format: expect.any(String), refresh_audio: true },
    ]);
    expect(result.current.state).toBe('playing');
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

  it('reports warning status when the reader view does not support TTS', async () => {
    const viewRef = { current: null as FoliateView | null };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    await act(() => result.current.start());
    expect(result.current.state).toBe('stopped');
    expect(result.current.ttsStatus).toEqual({
      headline: '当前文档暂不支持朗读',
      tone: 'warning',
    });
  });

  it('stops cleanly when the chapter has no readable sentences or reaches the end', async () => {
    const emptyView = createView();
    emptyView.getTTSSentences = vi.fn(async function* () {
      // empty generator
    });
    const emptyRef = { current: emptyView };
    const { result: emptyResult } = renderHook(() => useTTS({ viewRef: emptyRef, bookId: 'book' }));
    await act(() => emptyResult.current.start());
    expect(emptyResult.current.state).toBe('stopped');

    const singleView = createView();
    singleView.getTTSSentences = vi.fn(async function* () {
      yield {
        text: '唯一的一句话。',
        ssml: '<speak>唯一的一句话。</speak>',
        cfi: 'cfi-only',
        sectionIndex: 0,
        words: [],
      };
    });
    const singleRef = { current: singleView };
    const { result } = renderHook(() => useTTS({ viewRef: singleRef, bookId: 'book' }));
    await act(() => result.current.start());
    expect(result.current.state).toBe('playing');

    const audio = TestAudio.instances.at(-1)!;
    await act(async () => {
      audio.finish();
      await flushMediaEvents();
    });
    await waitFor(() => expect(result.current.state).toBe('stopped'));
  });

  it('pauses and shows resume prompt on 401 unauthorized response without retrying', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      json: async () => ({ code: 'unauthorized' }),
    } as Response);
    const viewRef = { current: createView() };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    await act(() => result.current.start());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('paused');
    expect(result.current.resumePromptVisible).toBe(true);
  });

  it('falls back to plain text SSML when backend rejects invalid_ssml', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Headers(),
        json: async () => ({ code: 'invalid_ssml' }),
      } as Response)
      .mockResolvedValue(audioResponse());
    const viewRef = { current: createView() };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    await act(() => result.current.start());
    expect(result.current.state).toBe('playing');
    expect(result.current.resumePromptVisible).toBe(false);
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('surfaces decode recovery fetch failure with explicit resume prompt', async () => {
    const viewRef = { current: createView() };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    await act(() => result.current.start());
    const audio = TestAudio.instances.at(-1)!;
    await act(async () => {
      audio.error = { code: 3 } as MediaError;
      audio.onerror?.();
      await flushMediaEvents();
    });
    expect(result.current.ttsStatus.headline).toBe('音频解码失败');

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: new Headers(),
      json: async () => ({ code: 'forbidden' }),
    } as Response);
    await act(() => result.current.resume());
    expect(result.current.ttsStatus.headline).toBe('无法重新获取音频');
    expect(result.current.resumePromptVisible).toBe(true);
  });

  it('synchronizes, restores, and navigates to reader highlights, and handles highlight errors', async () => {
    const range = document.createRange();
    const removeAllRanges = vi.fn();
    const mockDoc = { getSelection: () => ({ removeAllRanges }) } as unknown as Document;
    let loaded = false;
    const view = createView();
    view.renderer!.getContents = vi.fn(() => (loaded ? [{ index: 0, doc: mockDoc }] : []));
    view.goTo = vi.fn(async () => {
      loaded = true;
    });
    view.resolveCFI = vi.fn(() => ({
      index: 0,
      anchor: () => range,
    }));

    const viewRef = { current: view };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    await act(() => result.current.start());
    await waitFor(() =>
      expect(view.renderer?.scrollToAnchor).toHaveBeenCalledWith(range, true),
    );
    expect(view.goTo).toHaveBeenCalledWith('cfi-0');

    vi.mocked(view.renderer!.scrollToAnchor!).mockClear();
    await act(async () => {
      result.current.restoreCurrentHighlight();
      await flushMediaEvents();
    });
    expect(view.renderer?.scrollToAnchor).toHaveBeenCalledWith(range, true);

    vi.mocked(view.resolveCFI).mockImplementationOnce(() => {
      throw new Error('broken cfi');
    });
    await act(async () => {
      result.current.restoreCurrentHighlight();
      await flushMediaEvents();
    });
    expect(result.current.state).toBe('playing');

    await act(() => result.current.stop());
    expect(removeAllRanges).toHaveBeenCalled();
  });

  it('keeps playback paused when speech settings change while paused and resumes cleanly', async () => {
    const view = createView();
    const viewRef = { current: view };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    await act(() => result.current.start());
    await act(() => result.current.pause());
    expect(result.current.state).toBe('paused');

    const sentenceCallsBefore = vi.mocked(view.getTTSSentences!).mock.calls.length;
    await act(async () => {
      result.current.updateSettings({ voiceName: 'zh-CN-YunxiNeural' });
      await flushMediaEvents();
    });
    expect(result.current.state).toBe('paused');
    expect(vi.mocked(view.getTTSSentences!).mock.calls.length).toBe(sentenceCallsBefore);

    await act(() => result.current.resume());
    expect(result.current.state).toBe('playing');
    expect(backendTTS.getSettings().voiceName).toBe('zh-CN-YunxiNeural');
  });

  it('handles next/prev edge cases: idle no-op, end-of-book stop, first-sentence prev, and errors', async () => {
    const view = createView();
    view.getTTSSentences = vi.fn(async function* () {
      yield {
        text: '第一句。',
        ssml: '<speak>第一句。</speak>',
        cfi: 'cfi-0',
        sectionIndex: 0,
        words: [],
      };
    });
    view.getTTSPreviousCFI = vi.fn()
      .mockResolvedValueOnce('cfi-prev-chapter')
      .mockResolvedValueOnce(null);

    const viewRef = { current: view };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));

    // Safe no-op when stopped
    await act(() => result.current.next());
    await act(() => result.current.prev());
    expect(result.current.state).toBe('stopped');

    await act(() => result.current.start());
    expect(result.current.state).toBe('playing');

    // prev() at first sentence uses getTTSPreviousCFI when available
    await act(() => result.current.prev());
    expect(view.getTTSSentences).toHaveBeenLastCalledWith('cfi-prev-chapter');
    expect(result.current.state).toBe('playing');

    // prev() when getTTSPreviousCFI returns null replays current sentence
    await act(() => result.current.prev());
    expect(result.current.state).toBe('playing');

    // next() at last sentence stops playback
    await act(() => result.current.next());
    expect(result.current.state).toBe('stopped');

    // prev() error during getTTSPreviousCFI shows resume prompt
    vi.mocked(view.getTTSPreviousCFI).mockRejectedValueOnce(new Error('cfi lookup failed'));
    await act(() => result.current.start());
    await act(() => result.current.prev());
    expect(result.current.resumePromptVisible).toBe(true);
  });

  it('handles start/begin and continuation generator errors gracefully', async () => {
    const view = createView();
    view.getTTSSentences = vi.fn(async function* () {
      throw new Error('generator failed');
    });
    const viewRef = { current: view };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    await act(() => result.current.start());
    expect(result.current.state).toBe('paused');
    expect(result.current.resumePromptVisible).toBe(true);

    // Continuation failure after first chunk finishes (iterator keeps throwing after first chunk)
    view.getTTSSentences = vi.fn(() => {
      let count = 0;
      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              if (count < 2) {
                const index = count++;
                const text = `第${index}段，` + '连续朗读的测试文本。'.repeat(3);
                return {
                  done: false,
                  value: {
                    text,
                    ssml: `<speak>${text}</speak>`,
                    cfi: `cfi-${index}`,
                    sectionIndex: 0,
                    words: [],
                  },
                };
              }
              throw new Error('next section broken');
            },
          };
        },
      } as unknown as AsyncGenerator<TTSSentence>;
    });
    await act(() => result.current.stop());
    await act(() => result.current.start());
    expect(result.current.state).toBe('playing');
    const audio = TestAudio.instances.at(-1)!;
    await act(async () => {
      audio.finish();
      await flushMediaEvents();
    });
    await waitFor(() => expect(result.current.state).toBe('paused'));
    expect(result.current.resumePromptVisible).toBe(true);
  });

  it('cancels preparation when start() is toggled while preparing and handles resume races/errors', async () => {
    let deliverFetch!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>((resolve) => {
      deliverFetch = resolve;
    }));
    const viewRef = { current: createView() };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));

    let startPromise!: Promise<void>;
    await act(async () => {
      startPromise = result.current.start();
      await Promise.resolve();
    });
    expect(result.current.preparing).toBe(true);

    // Clicking start() while preparing pauses/cancels preparation
    await act(() => result.current.start());
    deliverFetch(audioResponse());
    await act(async () => {
      await startPromise;
    });
    expect(result.current.preparing).toBe(false);
    expect(result.current.state).toBe('paused');

    // Calling resume() when stopped with no current chunk calls begin()
    await act(() => result.current.stop());
    await act(() => result.current.resume());
    expect(result.current.state).toBe('playing');

    // Calling resume() when already playing is a no-op
    const audio = TestAudio.instances.at(-1)!;
    const playCalls = audio.playCalls;
    await act(() => result.current.resume());
    expect(audio.playCalls).toBe(playCalls);

    // Concurrent resume() while paused and play() rejects surfaces resume prompt
    await act(() => result.current.pause());
    audio.playError = new DOMException('Blocked', 'NotAllowedError');
    try {
      let finishPlay!: () => void;
      const origPlay = audio.play.bind(audio);
      vi.spyOn(audio, 'play').mockImplementationOnce(async () => {
        await new Promise<void>((r) => { finishPlay = r; });
        return origPlay();
      });
      await act(async () => {
        const r1 = result.current.resume();
        const r2 = result.current.resume();
        finishPlay();
        await Promise.all([r1, r2]);
      });
      expect(result.current.state).toBe('paused');
      expect(result.current.resumePromptVisible).toBe(true);
    } finally {
      audio.playError = null;
    }
  });

  it('calibrates duration ratio across chunks, updates remaining time, and re-acquires wake lock on foreground', async () => {
    const viewRef = { current: createView() };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    await act(() => result.current.start());
    const audio = TestAudio.instances.at(-1)!;

    // First chunk duration calibration + repeated timeupdate at same second
    await act(async () => {
      audio.tick(10);
      audio.tick(10.2);
      await flushMediaEvents();
    });
    expect(result.current.ttsStatus.headline).toBe('正在朗读');

    // Advance to next chunk and tick to exercise EMA calibration branch (prior !== undefined)
    await act(async () => {
      audio.finish();
      await flushMediaEvents();
    });
    await waitFor(() => expect(result.current.currentMark?.cfi).toBe('cfi-1'));
    await act(async () => {
      audio.tick(5);
      await flushMediaEvents();
    });

    // Foreground event while still playing re-requests wake lock
    mocks.requestWakeLock.mockClear();
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
      await flushMediaEvents();
    });
    expect(mocks.requestWakeLock).toHaveBeenCalled();
  });

  it('stops playback when sleep timer expires during playback, resume, or foreground check', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    try {
      const viewRef = { current: createView() };
      const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
      await act(() => result.current.start());
      await act(() => {
        result.current.setSleepTimerForMinutes(1);
      });

      // Advance clock past timer expiry without firing setTimeout, then tick audio
      nowSpy.mockReturnValue(1_000_000 + 120_000);
      const audio = TestAudio.instances.at(-1)!;
      await act(async () => {
        audio.tick(12);
        await flushMediaEvents();
      });
      expect(result.current.state).toBe('stopped');

      // Start again, set timer, expire clock, and verify resume() respects expired timer
      nowSpy.mockReturnValue(2_000_000);
      await act(() => result.current.start());
      await act(() => result.current.pause());
      await act(() => {
        result.current.setSleepTimerForMinutes(1);
      });
      nowSpy.mockReturnValue(2_000_000 + 120_000);
      await act(() => result.current.resume());
      expect(result.current.state).toBe('stopped');
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('advances via resume() when audio already ended before resume is called', async () => {
    const viewRef = { current: createView() };
    const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    await act(() => result.current.start());
    const audio = TestAudio.instances.at(-1)!;

    // Simulate paused state where element itself is already ended
    await act(() => result.current.pause());
    audio.ended = true;
    expect(backendTTS.hasEnded()).toBe(true);

    await act(() => result.current.resume());
    await waitFor(() => expect(result.current.currentMark?.cfi).toBe('cfi-1'));
    expect(result.current.state).toBe('playing');
  });

  it('preserves the exact sentence position on updateSettings even when localStorage is unavailable', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError', 'SecurityError');
    });

    try {
      const getTTSSentences = vi.fn(async function* (fromCFI?: string): AsyncGenerator<TTSSentence> {
        const match = fromCFI?.match(/^cfi-(\d+)$/);
        const startIndex = match ? Number(match[1]) : 0;
        for (let i = startIndex; i < 20; i++) {
          const text = `第${i}段，` + '连续朗读的测试文本。'.repeat(3);
          yield {
            text,
            ssml: `<speak>${text}</speak>`,
            cfi: `cfi-${i}`,
            sectionIndex: Math.floor(i / 2),
            words: [],
          };
        }
      });
      const view = {
        getTTSSentences,
        lastLocation: { cfi: 'cfi-start' },
        renderer: { getContents: vi.fn(() => []), nextSection: vi.fn(), scrollToAnchor: vi.fn() },
      } as unknown as FoliateView;
      const viewRef = { current: view };
      const { result } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));

      await act(() => result.current.start());
      const audio = TestAudio.instances.at(-1)!;
      await act(async () => {
        audio.finish();
        await flushMediaEvents();
      });
      await waitFor(() => expect(result.current.currentMark?.cfi).toBe('cfi-1'));

      // Changing an audio setting while playing must restart from cfi-1, not view.lastLocation.cfi.
      await act(async () => {
        result.current.updateSettings({ rate: 1.25 });
        await flushMediaEvents();
      });
      await waitFor(() => expect(getTTSSentences).toHaveBeenLastCalledWith('cfi-1'));

      // Advance to cfi-2, pause, change voice without localStorage, then resume from cfi-2.
      const restartedAudio = TestAudio.instances.at(-1)!;
      await act(async () => {
        restartedAudio.finish();
        await flushMediaEvents();
      });
      await waitFor(() => expect(result.current.currentMark?.cfi).toBe('cfi-2'));

      await act(() => result.current.pause());
      await act(async () => {
        result.current.updateSettings({ voiceName: 'zh-CN-YunxiNeural' });
        await flushMediaEvents();
      });
      await act(() => result.current.resume());
      expect(getTTSSentences).toHaveBeenLastCalledWith('cfi-2');
    } finally {
      setItemSpy.mockRestore();
      getItemSpy.mockRestore();
    }
  });

  it('cleans up audio, preloads, and wake lock on unmount', async () => {
    const viewRef = { current: createView() };
    const { result, unmount } = renderHook(() => useTTS({ viewRef, bookId: 'book' }));
    await act(() => result.current.start());
    mocks.releaseWakeLock.mockClear();
    unmount();
    expect(backendTTS.getState()).toBe('stopped');
    expect(backendTTS.getPreloadQueueLength()).toBe(0);
    expect(mocks.releaseWakeLock).toHaveBeenCalled();
  });
});
