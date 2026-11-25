import { act, renderHook } from '@testing-library/react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReaderImageZoom } from '@/hooks/useReaderImageZoom';

function createSurfaceElement() {
  const surface = document.createElement('div');
  const captured = new Set<number>();
  const setPointerCapture = vi.fn<(pointerId: number) => void>((id) => {
    captured.add(id);
  });
  const hasPointerCapture = vi.fn<(pointerId: number) => boolean>((id) => captured.has(id));
  const releasePointerCapture = vi.fn<(pointerId: number) => void>((id) => {
    captured.delete(id);
  });

  Object.defineProperties(surface, {
    setPointerCapture: { value: setPointerCapture, configurable: true },
    hasPointerCapture: { value: hasPointerCapture, configurable: true },
    releasePointerCapture: { value: releasePointerCapture, configurable: true },
  });

  return { surface, setPointerCapture, hasPointerCapture, releasePointerCapture };
}

function createMouseEvent(
  currentTarget: HTMLDivElement,
  overrides: {
    target?: EventTarget;
    clientX?: number;
    clientY?: number;
  } = {}
) {
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  const event = {
    target: overrides.target ?? currentTarget,
    currentTarget,
    clientX: overrides.clientX ?? 512,
    clientY: overrides.clientY ?? 384,
    preventDefault,
    stopPropagation,
  } as unknown as ReactMouseEvent<HTMLDivElement>;
  return { event, preventDefault, stopPropagation };
}

function createPointerEvent(
  currentTarget: HTMLDivElement,
  overrides: {
    pointerId?: number;
    pointerType?: string;
    clientX?: number;
    clientY?: number;
  } = {}
) {
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  const event = {
    target: currentTarget,
    currentTarget,
    pointerId: overrides.pointerId ?? 1,
    pointerType: overrides.pointerType ?? 'mouse',
    clientX: overrides.clientX ?? 512,
    clientY: overrides.clientY ?? 384,
    preventDefault,
    stopPropagation,
  } as unknown as ReactPointerEvent<HTMLDivElement>;
  return { event, preventDefault, stopPropagation };
}

describe('useReaderImageZoom', () => {
  let page: HTMLDivElement;
  let surface: HTMLDivElement;
  let setPointerCapture: ReturnType<typeof vi.fn<(pointerId: number) => void>>;
  let releasePointerCapture: ReturnType<typeof vi.fn<(pointerId: number) => void>>;

  beforeEach(() => {
    page = document.createElement('div');
    document.body.append(page);
    const created = createSurfaceElement();
    surface = created.surface;
    setPointerCapture = created.setPointerCapture;
    releasePointerCapture = created.releasePointerCapture;
    page.append(surface);
  });

  afterEach(() => {
    page.remove();
    vi.restoreAllMocks();
  });

  function renderZoomHook(pageRefOverride?: { current: HTMLDivElement | null }) {
    const pageRef = pageRefOverride ?? { current: page };
    const rendered = renderHook(() => useReaderImageZoom(pageRef));
    rendered.result.current.imageZoomSurfaceRef.current = surface;
    return rendered;
  }

  it('opens image zoom, updates page dataset, and restores focus on close', () => {
    const trigger = document.createElement('button');
    page.append(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { result } = renderZoomHook();
    expect(result.current.zoomedImage).toBeNull();
    expect(result.current.imageZoom).toEqual({ scale: 1, x: 0, y: 0 });
    expect(result.current.imageInteracting).toBe(false);
    expect(page.dataset.readerImageZoomOpen).toBeUndefined();

    act(() => {
      result.current.handleImageOpen({ src: 'https://example.com/plate.png', alt: '插图一' });
    });

    expect(result.current.zoomedImage).toEqual({
      src: 'https://example.com/plate.png',
      alt: '插图一',
    });
    expect(result.current.imageZoom).toEqual({ scale: 1, x: 0, y: 0 });
    expect(page.dataset.readerImageZoomOpen).toBe('true');

    // Simulate focus moving away while modal is open
    const otherButton = document.createElement('button');
    page.append(otherButton);
    otherButton.focus();
    expect(document.activeElement).toBe(otherButton);

    act(() => {
      result.current.handleImageClose();
    });

    expect(result.current.zoomedImage).toBeNull();
    expect(result.current.imageZoom).toEqual({ scale: 1, x: 0, y: 0 });
    expect(result.current.imageInteracting).toBe(false);
    expect(page.dataset.readerImageZoomOpen).toBeUndefined();
    expect(document.activeElement).toBe(trigger);
  });

  it('handles null pageRef and detached prior focus element cleanly', () => {
    const trigger = document.createElement('button');
    page.append(trigger);
    trigger.focus();

    const { result } = renderZoomHook({ current: null });

    act(() => {
      result.current.handleImageOpen({ src: 'https://example.com/a.png', alt: '' });
    });
    expect(result.current.zoomedImage?.src).toBe('https://example.com/a.png');

    // Remove the previously focused element before closing
    trigger.remove();
    act(() => {
      result.current.handleImageClose();
    });

    expect(result.current.zoomedImage).toBeNull();
  });

  it('steps zoom scale in/out within [1, 5] bounds and resets cleanly via callbacks', () => {
    const { result } = renderZoomHook();
    act(() => {
      result.current.handleImageOpen({ src: 'https://example.com/img.png', alt: 'diagram' });
    });

    const expectedSteps = [1.5, 2, 3, 4, 5, 5];
    for (const expectedScale of expectedSteps) {
      act(() => {
        result.current.handleImageZoomIn();
      });
      expect(result.current.imageZoom.scale).toBe(expectedScale);
    }

    act(() => {
      result.current.handleImageZoomOut();
    });
    expect(result.current.imageZoom.scale).toBe(4);

    act(() => {
      result.current.handleImageZoomReset();
    });
    expect(result.current.imageZoom).toEqual({ scale: 1, x: 0, y: 0 });

    // Zooming out at minimum clamps to 1
    act(() => {
      result.current.handleImageZoomOut();
    });
    expect(result.current.imageZoom).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('supports keyboard shortcuts (+, =, -, _, 0, Escape) only when open and without modifiers', () => {
    const trigger = document.createElement('button');
    page.append(trigger);
    trigger.focus();

    const { result } = renderZoomHook();

    // Shortcuts do nothing while closed
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', cancelable: true }));
    });
    expect(result.current.imageZoom.scale).toBe(1);

    act(() => {
      result.current.handleImageOpen({ src: 'https://example.com/img.png', alt: 'plate' });
    });

    // Modified keys and composing events are ignored
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', ctrlKey: true, cancelable: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', metaKey: true, cancelable: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', altKey: true, cancelable: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', isComposing: true, cancelable: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', cancelable: true }));
    });
    expect(result.current.imageZoom.scale).toBe(1);

    const plusEvent = new KeyboardEvent('keydown', { key: '+', cancelable: true });
    act(() => {
      window.dispatchEvent(plusEvent);
    });
    expect(plusEvent.defaultPrevented).toBe(true);
    expect(result.current.imageZoom.scale).toBe(1.5);

    const equalsEvent = new KeyboardEvent('keydown', { key: '=', cancelable: true });
    act(() => {
      window.dispatchEvent(equalsEvent);
    });
    expect(equalsEvent.defaultPrevented).toBe(true);
    expect(result.current.imageZoom.scale).toBe(2);

    const minusEvent = new KeyboardEvent('keydown', { key: '-', cancelable: true });
    act(() => {
      window.dispatchEvent(minusEvent);
    });
    expect(minusEvent.defaultPrevented).toBe(true);
    expect(result.current.imageZoom.scale).toBe(1.5);

    const underscoreEvent = new KeyboardEvent('keydown', { key: '_', cancelable: true });
    act(() => {
      window.dispatchEvent(underscoreEvent);
    });
    expect(underscoreEvent.defaultPrevented).toBe(true);
    expect(result.current.imageZoom.scale).toBe(1);

    // Zoom in and reset with '0'
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', cancelable: true }));
    });
    expect(result.current.imageZoom.scale).toBe(1.5);

    const zeroEvent = new KeyboardEvent('keydown', { key: '0', cancelable: true });
    act(() => {
      window.dispatchEvent(zeroEvent);
    });
    expect(zeroEvent.defaultPrevented).toBe(true);
    expect(result.current.imageZoom).toEqual({ scale: 1, x: 0, y: 0 });

    // Escape closes and restores focus + dataset
    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    act(() => {
      window.dispatchEvent(escapeEvent);
    });
    expect(escapeEvent.defaultPrevented).toBe(true);
    expect(result.current.zoomedImage).toBeNull();
    expect(page.dataset.readerImageZoomOpen).toBeUndefined();
    expect(document.activeElement).toBe(trigger);
  });

  it('zooms around pointer coordinates on wheel events and clamps to bounds', () => {
    const { result } = renderZoomHook();
    act(() => {
      result.current.handleImageOpen({ src: 'https://example.com/map.png', alt: 'map' });
    });

    const wheelIn = new WheelEvent('wheel', {
      deltaY: -400,
      clientX: 612,
      clientY: 484,
      cancelable: true,
    });
    act(() => {
      surface.dispatchEvent(wheelIn);
    });
    expect(wheelIn.defaultPrevented).toBe(true);
    expect(result.current.imageZoom.scale).toBeGreaterThan(1);
    expect(result.current.imageZoom.x).toBeLessThan(0);
    expect(result.current.imageZoom.y).toBeLessThan(0);

    // Extreme scroll up clamps at max scale 5
    act(() => {
      surface.dispatchEvent(new WheelEvent('wheel', { deltaY: -5000, clientX: 512, clientY: 384, cancelable: true }));
    });
    expect(result.current.imageZoom.scale).toBe(5);

    // Extreme scroll down clamps at min scale 1 and recenters
    act(() => {
      surface.dispatchEvent(new WheelEvent('wheel', { deltaY: 5000, clientX: 512, clientY: 384, cancelable: true }));
    });
    expect(result.current.imageZoom).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('toggles zoom between 1x and 2.5x on double-click and handles backdrop clicks', () => {
    const { result } = renderZoomHook();
    act(() => {
      result.current.handleImageOpen({ src: 'https://example.com/photo.png', alt: 'photo' });
    });

    const childImg = document.createElement('img');
    surface.append(childImg);

    // Clicking the child image does not close zoom
    const childClick = createMouseEvent(surface, { target: childImg });
    act(() => {
      result.current.handleImageSurfaceClick(childClick.event);
    });
    expect(childClick.stopPropagation).toHaveBeenCalledOnce();
    expect(result.current.zoomedImage).not.toBeNull();

    // Double-click zooms to 2.5 around cursor
    const dbl1 = createMouseEvent(surface, { target: childImg, clientX: 612, clientY: 384 });
    act(() => {
      result.current.handleImageDoubleClick(dbl1.event);
    });
    expect(dbl1.preventDefault).toHaveBeenCalledOnce();
    expect(dbl1.stopPropagation).toHaveBeenCalledOnce();
    expect(result.current.imageZoom.scale).toBe(2.5);
    expect(result.current.imageZoom.x).toBe(-150);
    expect(result.current.imageZoom.y).toBe(0);

    // Second double-click resets to 1x
    const dbl2 = createMouseEvent(surface, { target: childImg, clientX: 612, clientY: 384 });
    act(() => {
      result.current.handleImageDoubleClick(dbl2.event);
    });
    expect(result.current.imageZoom).toEqual({ scale: 1, x: 0, y: 0 });

    // Clicking the backdrop itself closes zoom
    const backdropClick = createMouseEvent(surface, { target: surface });
    act(() => {
      result.current.handleImageSurfaceClick(backdropClick.event);
    });
    expect(result.current.zoomedImage).toBeNull();
  });

  it('supports pointer drag panning when zoomed in and suppresses the subsequent backdrop click', () => {
    const { result } = renderZoomHook();
    act(() => {
      result.current.handleImageOpen({ src: 'https://example.com/map.png', alt: 'map' });
    });

    // At 1x scale, dragging does not pan
    act(() => {
      result.current.handleImagePointerDown(createPointerEvent(surface, { pointerId: 1, clientX: 100, clientY: 100 }).event);
      result.current.handleImagePointerMove(createPointerEvent(surface, { pointerId: 1, clientX: 150, clientY: 130 }).event);
      result.current.handleImagePointerEnd(createPointerEvent(surface, { pointerId: 1, clientX: 150, clientY: 130 }).event);
    });
    expect(result.current.imageZoom).toEqual({ scale: 1, x: 0, y: 0 });
    expect(result.current.imageInteracting).toBe(false);

    // Zoom in, then pan with pointer drag
    act(() => {
      result.current.handleImageZoomIn();
    });
    expect(result.current.imageZoom.scale).toBe(1.5);

    act(() => {
      result.current.handleImagePointerDown(createPointerEvent(surface, { pointerId: 2, clientX: 200, clientY: 200 }).event);
    });
    expect(result.current.imageInteracting).toBe(true);
    expect(setPointerCapture).toHaveBeenCalledWith(2);

    // Untracked pointer move is ignored
    const untrackedMove = createPointerEvent(surface, { pointerId: 99, clientX: 400, clientY: 400 });
    act(() => {
      result.current.handleImagePointerMove(untrackedMove.event);
    });
    expect(untrackedMove.preventDefault).not.toHaveBeenCalled();

    const dragMove = createPointerEvent(surface, { pointerId: 2, clientX: 245, clientY: 170 });
    act(() => {
      result.current.handleImagePointerMove(dragMove.event);
    });
    expect(dragMove.preventDefault).toHaveBeenCalledOnce();
    expect(result.current.imageZoom).toEqual({ scale: 1.5, x: 45, y: -30 });

    act(() => {
      result.current.handleImagePointerEnd(createPointerEvent(surface, { pointerId: 2, clientX: 245, clientY: 170 }).event);
    });
    expect(releasePointerCapture).toHaveBeenCalledWith(2);
    expect(result.current.imageInteracting).toBe(false);

    // First click after drag (> 8px) is suppressed so backdrop doesn't close
    act(() => {
      result.current.handleImageSurfaceClick(createMouseEvent(surface).event);
    });
    expect(result.current.zoomedImage).not.toBeNull();

    // Next click closes normally
    act(() => {
      result.current.handleImageSurfaceClick(createMouseEvent(surface).event);
    });
    expect(result.current.zoomedImage).toBeNull();
  });

  it('supports two-pointer pinch-to-zoom and transitions remaining finger into drag', () => {
    const { result } = renderZoomHook();
    act(() => {
      result.current.handleImageOpen({ src: 'https://example.com/chart.png', alt: 'chart' });
    });

    // Place two fingers 100px apart centered at viewport center (512, 384)
    act(() => {
      result.current.handleImagePointerDown(
        createPointerEvent(surface, { pointerId: 1, pointerType: 'touch', clientX: 462, clientY: 384 }).event
      );
      result.current.handleImagePointerDown(
        createPointerEvent(surface, { pointerId: 2, pointerType: 'touch', clientX: 562, clientY: 384 }).event
      );
    });
    expect(result.current.imageInteracting).toBe(true);

    // Spread fingers to 200px apart (2x zoom) and shift center by +20px in X
    act(() => {
      result.current.handleImagePointerMove(
        createPointerEvent(surface, { pointerId: 1, pointerType: 'touch', clientX: 432, clientY: 384 }).event
      );
      result.current.handleImagePointerMove(
        createPointerEvent(surface, { pointerId: 2, pointerType: 'touch', clientX: 632, clientY: 384 }).event
      );
    });
    expect(result.current.imageZoom.scale).toBeCloseTo(2);
    expect(result.current.imageZoom.x).toBeCloseTo(20);
    expect(result.current.imageZoom.y).toBeCloseTo(0);

    // Lift finger 2 -> finger 1 stays active and transitions seamlessly into drag
    act(() => {
      result.current.handleImagePointerEnd(
        createPointerEvent(surface, { pointerId: 2, pointerType: 'touch', clientX: 632, clientY: 384 }).event
      );
    });
    expect(result.current.imageInteracting).toBe(true);

    // Drag with remaining finger 1 by +15px in X, +10px in Y
    act(() => {
      result.current.handleImagePointerMove(
        createPointerEvent(surface, { pointerId: 1, pointerType: 'touch', clientX: 447, clientY: 394 }).event
      );
    });
    expect(result.current.imageZoom.x).toBeCloseTo(35);
    expect(result.current.imageZoom.y).toBeCloseTo(10);

    // Lift final finger
    act(() => {
      result.current.handleImagePointerEnd(
        createPointerEvent(surface, { pointerId: 1, pointerType: 'touch', clientX: 447, clientY: 394 }).event
      );
    });
    expect(result.current.imageInteracting).toBe(false);

    // Backdrop click right after gesture is suppressed
    act(() => {
      result.current.handleImageSurfaceClick(createMouseEvent(surface).event);
    });
    expect(result.current.zoomedImage).not.toBeNull();
  });

  it('toggles zoom on rapid touch double-tap and ignores slow or distant taps', () => {
    let now = 1000;
    vi.spyOn(window.performance, 'now').mockImplementation(() => now);

    const { result } = renderZoomHook();
    act(() => {
      result.current.handleImageOpen({ src: 'https://example.com/art.png', alt: 'art' });
    });

    const tap = (x: number, y: number, pointerId: number) => {
      act(() => {
        result.current.handleImagePointerDown(
          createPointerEvent(surface, { pointerId, pointerType: 'touch', clientX: x, clientY: y }).event
        );
        result.current.handleImagePointerEnd(
          createPointerEvent(surface, { pointerId, pointerType: 'touch', clientX: x, clientY: y }).event
        );
      });
    };

    // First tap
    tap(512, 384, 1);
    expect(result.current.imageZoom.scale).toBe(1);

    // Second tap too slow (>= 320ms) -> does not zoom
    now = 1400;
    tap(512, 384, 2);
    expect(result.current.imageZoom.scale).toBe(1);

    // Third tap quick (< 320ms) but too far (>= 32px) -> does not zoom
    now = 1500;
    tap(600, 384, 3);
    expect(result.current.imageZoom.scale).toBe(1);

    // Fourth tap quick (< 320ms) and close (< 32px) -> zooms to 2.5x
    now = 1650;
    tap(605, 388, 4);
    expect(result.current.imageZoom.scale).toBe(2.5);

    // Backdrop click right after double-tap is suppressed
    act(() => {
      result.current.handleImageSurfaceClick(createMouseEvent(surface).event);
    });
    expect(result.current.zoomedImage).not.toBeNull();
  });

  it('cleans up keyboard and wheel listeners on unmount', () => {
    const addWindowListener = vi.spyOn(window, 'addEventListener');
    const removeWindowListener = vi.spyOn(window, 'removeEventListener');
    const addSurfaceListener = vi.spyOn(surface, 'addEventListener');
    const removeSurfaceListener = vi.spyOn(surface, 'removeEventListener');

    const { result, unmount } = renderZoomHook();
    act(() => {
      result.current.handleImageOpen({ src: 'https://example.com/end.png', alt: 'end' });
    });

    expect(addWindowListener).toHaveBeenCalledWith('keydown', expect.any(Function), { capture: true });
    expect(addSurfaceListener).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: false });

    unmount();

    expect(removeWindowListener).toHaveBeenCalledWith('keydown', expect.any(Function), { capture: true });
    expect(removeSurfaceListener).toHaveBeenCalledWith('wheel', expect.any(Function));

    // Dispatching events after unmount does not call preventDefault
    const keyEvent = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    window.dispatchEvent(keyEvent);
    expect(keyEvent.defaultPrevented).toBe(false);

    const wheelEvent = new WheelEvent('wheel', { deltaY: -100, cancelable: true });
    surface.dispatchEvent(wheelEvent);
    expect(wheelEvent.defaultPrevented).toBe(false);
  });
});
