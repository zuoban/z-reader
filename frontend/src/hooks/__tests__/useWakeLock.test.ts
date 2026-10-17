import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useWakeLock } from '@/hooks/useWakeLock';

describe('screen wake lock', () => {
  it('reacquires after the operating system releases the previous sentinel', async () => {
    let onRelease!: () => void;
    const first = { released: false, release: vi.fn(async () => {}),
      addEventListener: vi.fn((_event, listener) => { onRelease = listener; }) };
    const second = { released: false, release: vi.fn(async () => {}) };
    const request = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
    const { result } = renderHook(() => useWakeLock());
    await act(() => result.current.requestWakeLock());
    first.released = true;
    act(() => onRelease());
    await act(() => result.current.requestWakeLock());
    expect(request).toHaveBeenCalledTimes(2);
    await act(() => result.current.releaseWakeLock());
    expect(second.release).toHaveBeenCalledOnce();
  });
});
