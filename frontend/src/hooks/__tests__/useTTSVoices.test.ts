import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTTSVoices } from '@/hooks/useTTSVoices';
import { deferred } from '@/test/deferred';

vi.mock('@/lib/api', () => ({
  getAuthHeaders: () => ({}),
  handleAuthResponse: () => {},
}));

describe('voice loading on demand', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('keeps built-in voices available and fetches once after controls are requested', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([])));
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(
      ({ enabled }) => useTTSVoices('zh-CN-XiaoxiaoNeural', enabled),
      { initialProps: { enabled: false } },
    );
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.voices.length).toBeGreaterThan(0);
    rerender({ enabled: true });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.voicesLoading).toBe(false));
    rerender({ enabled: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh load after Strict Mode cleanup and ignores the cancelled request', async () => {
    const previous = deferred<Response>();
    const current = deferred<Response>();
    const fetchMock = vi.fn<typeof fetch>()
      .mockReturnValueOnce(previous.promise)
      .mockReturnValueOnce(current.promise);
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useTTSVoices('zh-CN-XiaoxiaoNeural', true), {
      reactStrictMode: true,
    });

    try {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
      expect(fetchMock.mock.calls[1][1]?.signal?.aborted).toBe(false);
      const activeLoad = result.current.loadVoices();
      await act(async () => { previous.reject(new Error('late failure')); });
      expect(result.current.voicesLoading).toBe(true);
      expect(result.current.loadVoices()).toBe(activeLoad);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await act(async () => { current.resolve(new Response('[]')); });
      expect(result.current.voicesLoading).toBe(false);
      expect(result.current.voicesError).toBeNull();
    } finally {
      previous.resolve(new Response('[]'));
      current.resolve(new Response('[]'));
    }
  });

  it('clears the voice retry timer when the reader closes during backoff', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new Error('network error'));
    vi.stubGlobal('fetch', fetchMock);
    const { result, unmount } = renderHook(() => useTTSVoices('zh-CN-XiaoxiaoNeural'));
    let load!: Promise<void>;
    await act(async () => { load = result.current.loadVoices(); });

    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    await load;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('aborts an in-flight voice request when the reader closes', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url, init) => {
      signal = init.signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }));
    const { unmount } = renderHook(() => useTTSVoices('zh-CN-XiaoxiaoNeural', true));
    await waitFor(() => expect(signal).toBeDefined());
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
