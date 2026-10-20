import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTTSSession } from '@/hooks/useTTSSession';
import type { FoliateView } from '@/lib/types';
import type { TTSMark } from '@/lib/tts';

describe('speech session persistence', () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());
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
});
