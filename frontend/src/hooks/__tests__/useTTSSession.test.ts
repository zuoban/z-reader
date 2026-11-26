import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTTSSession } from '@/hooks/useTTSSession';
import { TTS_SESSION_TTL } from '@/lib/tts-helpers';
import type { FoliateView } from '@/lib/types';
import type { TTSMark } from '@/lib/tts';

describe('speech session persistence', () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
  function setup() {
    const currentMarkRef = { current: { name: '0', text: 'one', cfi: 'cfi-0' } as TTSMark };
    const viewRef = { current: {} as FoliateView };
    const getSettings = () => ({ rate: 0, voiceName: 'voice', highlightMode: 'word' as const });
    return { currentMarkRef, ...renderHook(() => useTTSSession({
      bookId: 'book', currentMarkRef, viewRef, getSettings,
    })) };
  }

  it('coalesces frequent marks and eventually persists the latest spoken position', () => {
    const writes = vi.spyOn(localStorage, 'setItem');
    const { result, currentMarkRef } = setup();
    act(() => result.current.saveTTSSession());
    for (let i = 1; i <= 10; i++) {
      currentMarkRef.current = { name: String(i), text: 'word', cfi: `cfi-${i}` };
      act(() => result.current.saveTTSSession());
    }
    expect(writes).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(2000));
    expect(JSON.parse(localStorage.getItem('z-reader-tts-session:book')!).cfi).toBe('cfi-10');
    expect(writes).toHaveBeenCalledTimes(2);
    writes.mockRestore();
  });

  it('flushes the latest mark immediately and clears pending writes when stopped', () => {
    const { result, currentMarkRef } = setup();
    act(() => result.current.saveTTSSession());
    currentMarkRef.current = { name: '1', text: 'two', cfi: 'cfi-1' };
    act(() => result.current.flushTTSSession());
    expect(JSON.parse(localStorage.getItem('z-reader-tts-session:book')!).cfi).toBe('cfi-1');
    act(() => { result.current.saveTTSSession(); result.current.clearTTSSession(); });
    act(() => vi.runAllTimers());
    expect(localStorage.getItem('z-reader-tts-session:book')).toBeNull();
  });

  it('loads valid snapshots, drops expired or malformed ones, flushes on unmount, and ignores storage errors', () => {
    const key = 'z-reader-tts-session:book';
    const { result, currentMarkRef, unmount } = setup();

    // Missing item returns null
    expect(result.current.loadTTSSession()).toBeNull();

    // Malformed JSON returns null
    localStorage.setItem(key, '{bad-json');
    expect(result.current.loadTTSSession()).toBeNull();

    // Expired or missing-cfi snapshot is removed and returns null
    localStorage.setItem(key, JSON.stringify({ cfi: 'cfi-old', timestamp: Date.now() - TTS_SESSION_TTL - 10 }));
    expect(result.current.loadTTSSession()).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();

    localStorage.setItem(key, JSON.stringify({ timestamp: Date.now() }));
    expect(result.current.loadTTSSession()).toBeNull();

    // Valid snapshot loads cleanly
    const valid = {
      cfi: 'cfi-valid',
      markName: '2',
      markText: 'sentence',
      timestamp: Date.now(),
      settings: { rate: 0, voiceName: 'voice', highlightMode: 'word' as const },
    };
    localStorage.setItem(key, JSON.stringify(valid));
    expect(result.current.loadTTSSession()).toEqual(valid);

    // Pending debounced save flushes on unmount
    act(() => result.current.saveTTSSession());
    currentMarkRef.current = { name: '9', text: 'unmount-flush', cfi: 'cfi-unmount' };
    act(() => result.current.saveTTSSession());
    unmount();
    expect(JSON.parse(localStorage.getItem(key)!).cfi).toBe('cfi-unmount');

    // Graceful no-op when localStorage throws
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const removeItemSpy = vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    const retryHook = renderHook(() =>
      useTTSSession({
        bookId: 'book',
        currentMarkRef: { current: { name: '1', text: 'x', cfi: 'cfi-x' } as TTSMark },
        viewRef: { current: {} as FoliateView },
        getSettings: () => ({ rate: 0, voiceName: 'voice', highlightMode: 'word' as const }),
      })
    );
    expect(() => act(() => retryHook.result.current.flushTTSSession())).not.toThrow();
    expect(() => act(() => retryHook.result.current.clearTTSSession())).not.toThrow();
    expect(setItemSpy).toHaveBeenCalled();
    expect(removeItemSpy).toHaveBeenCalled();
  });
});
