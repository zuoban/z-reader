import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useWakeLock } from '@/hooks/useWakeLock';
import { deferred } from '@/test/deferred';

describe('screen wake lock', () => {
  it('keeps a pending lock when playback resumes before it is granted', async () => {
    const sentinel = { release: vi.fn(async () => {}) };
    const grant = deferred<typeof sentinel>();
    const request = vi.fn(() => grant.promise);
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
    const { result } = renderHook(() => useWakeLock());

    await act(async () => {
      const first = result.current.requestWakeLock();
      const pause = result.current.releaseWakeLock();
      const resume = result.current.requestWakeLock();
      grant.resolve(sentinel);
      await Promise.all([first, pause, resume]);
    });

    expect(request).toHaveBeenCalledOnce();
    expect(sentinel.release).not.toHaveBeenCalled();
    await act(() => result.current.releaseWakeLock());
    expect(sentinel.release).toHaveBeenCalledOnce();
  });

  it('releases a pending lock if playback stays paused', async () => {
    const sentinel = { release: vi.fn(async () => {}) };
    const grant = deferred<typeof sentinel>();
    const request = vi.fn(() => grant.promise);
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
    const { result } = renderHook(() => useWakeLock());

    await act(async () => {
      const first = result.current.requestWakeLock();
      const pause = result.current.releaseWakeLock();
      grant.resolve(sentinel);
      await Promise.all([first, pause]);
    });
    expect(sentinel.release).toHaveBeenCalledOnce();
  });

  it.each(['held', 'pending'])('waits for overlapping releases of a %s lock', async (state) => {
    const released = deferred<void>();
    const sentinel = { release: vi.fn(() => released.promise) };
    const grant = deferred<typeof sentinel>();
    const request = vi.fn(() => grant.promise);
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
    const { result } = renderHook(() => useWakeLock());

    const acquisition = result.current.requestWakeLock();
    if (state === 'held') {
      grant.resolve(sentinel);
      await acquisition;
    }
    const firstRelease = result.current.releaseWakeLock();
    grant.resolve(sentinel);
    await vi.waitFor(() => expect(sentinel.release).toHaveBeenCalledOnce());

    const finished = vi.fn();
    const secondRelease = result.current.releaseWakeLock().then(finished);
    try {
      await act(async () => {});
      expect(finished).not.toHaveBeenCalled();
    } finally {
      released.resolve();
      await Promise.all([acquisition, firstRelease, secondRelease]);
    }
    expect(finished).toHaveBeenCalledOnce();
    expect(sentinel.release).toHaveBeenCalledOnce();
  });

  it('acquires a replacement while the previous lock finishes releasing', async () => {
    const released = deferred<void>();
    const previous = { release: vi.fn(() => released.promise) };
    const replacement = { release: vi.fn(async () => {}) };
    const request = vi.fn().mockResolvedValueOnce(previous).mockResolvedValueOnce(replacement);
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
    const { result } = renderHook(() => useWakeLock());
    await act(() => result.current.requestWakeLock());

    await act(async () => {
      const pause = result.current.releaseWakeLock();
      await result.current.requestWakeLock();
      released.resolve();
      await pause;
    });

    expect(request).toHaveBeenCalledTimes(2);
    expect(replacement.release).not.toHaveBeenCalled();
    await act(() => result.current.releaseWakeLock());
    expect(replacement.release).toHaveBeenCalledOnce();
  });
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
