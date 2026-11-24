import { fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useReaderControls } from '@/hooks/useReaderControls';
import '../../../public/foliate/paginator.js';

interface TouchPaginator extends HTMLElement {
  size: number;
  pages: number;
  open: (book: { sections: unknown[] }) => void;
  scrollToAnchor: (anchor: number | Range) => Promise<void>;
  snap: (vx: number, vy: number) => void;
}

function touch(identifier: number, screenX: number) {
  return { identifier, screenX, screenY: 40, clientX: screenX, clientY: 40 };
}

describe('Foliate paginated touch gestures', () => {
  let iframe: HTMLIFrameElement | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('visualViewport', { scale: 1 });
  });

  afterEach(() => {
    iframe?.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function bindChapter() {
    const paginator = document.createElement('foliate-paginator') as TouchPaginator;
    iframe = document.body.appendChild(document.createElement('iframe'));
    const chapter = iframe.contentDocument!;
    const scrollBy = vi.spyOn(paginator, 'scrollBy').mockImplementation(() => {});
    const snap = vi.spyOn(paginator, 'snap').mockImplementation(() => {});
    paginator.dispatchEvent(new CustomEvent('load', { detail: { doc: chapter } }));
    return { paginator, surface: chapter.body, scrollBy, snap };
  }

  it('does not resume dragging or snap after a second finger lifts', async () => {
    const { surface, scrollBy, snap } = bindChapter();
    const first = touch(1, 160);
    const second = touch(2, 230);
    fireEvent.touchStart(surface, { touches: [first], changedTouches: [first] });
    fireEvent.touchStart(surface, { touches: [first, second], changedTouches: [second] });
    fireEvent.touchEnd(surface, { touches: [first], changedTouches: [second] });
    const moved = touch(1, 159);
    fireEvent.touchMove(surface, { touches: [moved], changedTouches: [moved] });
    fireEvent.touchEnd(surface, { touches: [], changedTouches: [moved] });
    await vi.advanceTimersByTimeAsync(32);

    expect(scrollBy).not.toHaveBeenCalled();
    expect(snap).not.toHaveBeenCalled();
  });

  it.each(['touchend', 'touchcancel'] as const)('keeps the reading position on %s after a jump', async (type) => {
    const attachShadow = HTMLElement.prototype.attachShadow;
    vi.spyOn(HTMLElement.prototype, 'attachShadow').mockImplementation(function (
      this: HTMLElement, options: ShadowRootInit,
    ) {
      return attachShadow.call(this, { ...options, mode: 'open' });
    });
    const { paginator, surface, scrollBy, snap } = bindChapter();
    const onNext = vi.fn();
    const { result, unmount } = renderHook(() => useReaderControls({
      pageRef: { current: null }, onPrev: vi.fn(), onNext, onBack: vi.fn(),
    }));
    const unbind = result.current.bindReaderDocument(surface.ownerDocument, { renderer: paginator });
    scrollBy.mockRestore();
    vi.spyOn(paginator, 'size', 'get').mockReturnValue(100);
    vi.spyOn(paginator, 'pages', 'get').mockReturnValue(6);
    paginator.open({ sections: [] });
    const container = paginator.shadowRoot!.getElementById('container')!;
    await paginator.scrollToAnchor(0);
    expect(container.scrollLeft).toBe(100);

    const start = touch(1, 150);
    const moved = touch(1, 100);
    fireEvent.touchStart(surface, { touches: [start], changedTouches: [start] });
    fireEvent.touchMove(surface, { touches: [moved], changedTouches: [moved] });
    expect(container.scrollLeft).toBe(150);

    await paginator.scrollToAnchor(2 / 3);
    expect(container.scrollLeft).toBe(300);
    const finish = type === 'touchend' ? fireEvent.touchEnd : fireEvent.touchCancel;
    finish(surface, { touches: [], changedTouches: [moved] });
    await vi.advanceTimersByTimeAsync(32);
    expect(container.scrollLeft).toBe(300);
    expect(onNext).not.toHaveBeenCalled();
    expect(snap).not.toHaveBeenCalled();
    unbind?.();
    unmount();
  });

  it('clears a cancelled drag and snaps once for the next single-finger swipe', async () => {
    const { surface, scrollBy, snap } = bindChapter();
    const start = touch(1, 150);
    const moved = touch(1, 100);
    fireEvent.touchStart(surface, { touches: [start], changedTouches: [start] });
    await vi.advanceTimersByTimeAsync(20);
    fireEvent.touchMove(surface, { touches: [moved], changedTouches: [moved] });
    expect(scrollBy).toHaveBeenCalledWith(50, 0);
    fireEvent.touchCancel(surface, { touches: [], changedTouches: [moved] });
    fireEvent.touchEnd(surface, { touches: [], changedTouches: [moved] });
    await vi.advanceTimersByTimeAsync(32);
    expect(snap).not.toHaveBeenCalled();

    const nextStart = touch(2, 160);
    const nextMoved = touch(2, 100);
    fireEvent.touchStart(surface, { touches: [nextStart], changedTouches: [nextStart] });
    await vi.advanceTimersByTimeAsync(20);
    fireEvent.touchMove(surface, { touches: [nextMoved], changedTouches: [nextMoved] });
    expect(fireEvent.touchEnd(surface, { touches: [], changedTouches: [nextMoved] })).toBe(false);
    await vi.advanceTimersByTimeAsync(32);
    expect(snap).toHaveBeenCalledExactlyOnceWith(expect.any(Number), 0);
  });
});
