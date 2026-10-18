import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTTSVoices } from '@/hooks/useTTSVoices';

vi.mock('@/lib/api', () => ({
  getAuthHeaders: () => ({}),
  handleAuthResponse: () => {},
}));

describe('voice loading on demand', () => {
  afterEach(() => vi.unstubAllGlobals());

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
