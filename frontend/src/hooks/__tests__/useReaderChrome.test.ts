import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReaderChrome } from '@/hooks/useReaderChrome';

const baseState = {
  loading: false,
  tocOpen: false,
  keepHeaderVisible: false,
  currentChapter: '',
  currentChapterHref: '',
};

describe('useReaderChrome', () => {
  let nextFrameId = 1;
  let queuedFrames: Map<number, FrameRequestCallback>;

  beforeEach(() => {
    nextFrameId = 1;
    queuedFrames = new Map();

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      const id = nextFrameId++;
      queuedFrames.set(id, cb);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id: number) => {
      queuedFrames.delete(id);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function flushAnimationFrames() {
    const entries = Array.from(queuedFrames.entries());
    queuedFrames.clear();
    for (const [, cb] of entries) {
      cb(16);
    }
  }

  it('allows hiding header only when loading and all overlays including searchOpen are closed', () => {
    const { result } = renderHook(() => useReaderChrome());

    // Initially loading is true in stateRef so hideHeader is blocked
    act(() => {
      result.current.hideHeader();
    });
    expect(result.current.isHeaderVisible).toBe(true);

    // Clear loading -> hideHeader works
    act(() => {
      result.current.syncChromeState(baseState);
      result.current.hideHeader();
    });
    expect(result.current.isHeaderVisible).toBe(false);

    // showHeader brings it back immediately
    act(() => {
      result.current.showHeader();
    });
    expect(result.current.isHeaderVisible).toBe(true);

    const blockingFlags = [
      'loading',
      'tocOpen',
      'keepHeaderVisible',
    ] as const;

    for (const flag of blockingFlags) {
      act(() => {
        result.current.syncChromeState(baseState);
        result.current.hideHeader();
      });
      expect(result.current.isHeaderVisible).toBe(false);

      act(() => {
        result.current.syncChromeState({ ...baseState, [flag]: true });
      });
      act(() => {
        flushAnimationFrames();
      });
      expect(result.current.isHeaderVisible).toBe(true);

      act(() => {
        result.current.hideHeader();
      });
      expect(result.current.isHeaderVisible).toBe(true);
    }
  });

  it('cancels previously scheduled header show frame when syncChromeState fires rapidly', () => {
    const { result } = renderHook(() => useReaderChrome());

    act(() => {
      result.current.syncChromeState({ ...baseState, keepHeaderVisible: true });
      result.current.syncChromeState({ ...baseState, tocOpen: true });
    });

    expect(window.cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(queuedFrames.size).toBe(1);

    act(() => {
      flushAnimationFrames();
    });
    expect(result.current.isHeaderVisible).toBe(true);
  });

  it('scrolls to active TOC chapter on open and chapter change while respecting reduced motion', () => {
    const { result } = renderHook(() => useReaderChrome());

    const container = document.createElement('div');
    const item = document.createElement('button');
    item.setAttribute('data-current-chapter', 'true');
    const scrollIntoView = vi.fn();
    item.scrollIntoView = scrollIntoView;
    container.appendChild(item);

    // Without container / active item -> returns false
    expect(result.current.scrollToCurrentChapter()).toBe(false);

    (result.current.tocListRef as { current: HTMLDivElement | null }).current = container;

    // Default matchMedia prefers-reduced-motion: false -> smooth
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
    } as MediaQueryList);

    act(() => {
      result.current.syncChromeState({
        ...baseState,
        tocOpen: true,
        currentChapter: 'Chapter 1',
        currentChapterHref: 'ch1.xhtml',
      });
    });
    act(() => {
      flushAnimationFrames();
    });

    expect(scrollIntoView).toHaveBeenCalledWith({
      block: 'center',
      inline: 'nearest',
      behavior: 'smooth',
    });

    // Re-syncing with the same chapter while TOC remains open does not reschedule scroll
    scrollIntoView.mockClear();
    act(() => {
      result.current.syncChromeState({
        ...baseState,
        tocOpen: true,
        currentChapter: 'Chapter 1',
        currentChapterHref: 'ch1.xhtml',
      });
      flushAnimationFrames();
    });
    expect(scrollIntoView).not.toHaveBeenCalled();

    // Changing chapter while open reschedules and respects prefers-reduced-motion: reduce
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
    } as MediaQueryList);

    act(() => {
      result.current.syncChromeState({
        ...baseState,
        tocOpen: true,
        currentChapter: 'Chapter 2',
        currentChapterHref: 'ch1.xhtml',
      });
      // Rapid second update cancels the first queued locate frame
      result.current.syncChromeState({
        ...baseState,
        tocOpen: true,
        currentChapter: 'Chapter 2',
        currentChapterHref: 'ch2.xhtml',
      });
    });
    act(() => {
      flushAnimationFrames();
    });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: 'center',
      inline: 'nearest',
      behavior: 'auto',
    });
  });

  it('cancels pending animation frames on unmount', () => {
    const { result, unmount } = renderHook(() => useReaderChrome());

    act(() => {
      result.current.syncChromeState({
        ...baseState,
        tocOpen: true,
        currentChapter: 'Chapter 1',
      });
    });

    expect(queuedFrames.size).toBe(2);

    unmount();

    expect(queuedFrames.size).toBe(0);
    expect(window.cancelAnimationFrame).toHaveBeenCalledTimes(2);
  });
});
