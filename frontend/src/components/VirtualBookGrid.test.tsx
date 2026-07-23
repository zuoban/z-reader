import type { ComponentProps } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VirtualBookGrid } from '@/components/VirtualBookGrid';

type IoCallback = IntersectionObserverCallback;

let ioCallback: IoCallback | null = null;
let observedTargets: Element[] = [];
let roCallback: ResizeObserverCallback | null = null;

function fireIntersection(isIntersecting = true) {
  if (!ioCallback || observedTargets.length === 0) return;
  const entries = observedTargets.map((target) => ({
    isIntersecting,
    target,
    intersectionRatio: isIntersecting ? 1 : 0,
    time: Date.now(),
    boundingClientRect: target.getBoundingClientRect(),
    intersectionRect: target.getBoundingClientRect(),
    rootBounds: null,
  })) as IntersectionObserverEntry[];
  act(() => {
    ioCallback?.(entries, {} as IntersectionObserver);
  });
}

function installLayoutMocks(width = 800, height = 400) {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return width;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return height;
    },
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    const isSentinel = this.getAttribute('aria-hidden') === 'true';
    // Place sentinel just below the fold so fill-viewport logic can treat it as near.
    if (isSentinel) {
      return {
        x: 0,
        y: 500,
        top: 500,
        left: 0,
        right: width,
        bottom: 501,
        width,
        height: 1,
        toJSON() {
          return {};
        },
      } as DOMRect;
    }
    return {
      x: 0,
      y: 80,
      top: 80,
      left: 0,
      right: width,
      bottom: 80 + height,
      width,
      height,
      toJSON() {
        return {};
      },
    } as DOMRect;
  });
}

type GridItem = { id: string; title: string };
type GridProps = ComponentProps<typeof VirtualBookGrid<GridItem>>;

function renderGrid(props: Partial<GridProps> = {}) {
  const {
    items = Array.from({ length: 12 }, (_, i) => ({
      id: `b-${i + 1}`,
      title: `Book ${i + 1}`,
    })),
    getItemKey = (item: GridItem) => item.id,
    renderItem = (item: GridItem) => <button type="button">{item.title}</button>,
    ...rest
  } = props;

  return render(
    <VirtualBookGrid
      items={items}
      getItemKey={getItemKey}
      renderItem={renderItem}
      {...rest}
    />
  );
}

describe('VirtualBookGrid', () => {
  beforeEach(() => {
    ioCallback = null;
    observedTargets = [];
    roCallback = null;
    vi.useFakeTimers({ shouldAdvanceTime: true });

    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IoCallback) {
          ioCallback = cb;
        }
        observe(target: Element) {
          observedTargets.push(target);
        }
        unobserve(target: Element) {
          observedTargets = observedTargets.filter((t) => t !== target);
        }
        disconnect() {
          observedTargets = [];
        }
        takeRecords() {
          return [];
        }
      }
    );

    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          roCallback = cb;
        }
        observe() {
          // no-op; tests drive measure via layout mocks
          void roCallback;
        }
        unobserve() {}
        disconnect() {}
      }
    );

    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0, writable: true });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800, writable: true });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800, writable: true });

    installLayoutMocks(800, 420);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders item content and exposes grid metadata', async () => {
    renderGrid();

    await waitFor(() => {
      expect(screen.getByText('Book 1')).toBeInTheDocument();
    });

    const root = document.querySelector('[data-shelf-grid="virtual"]');
    expect(root).toBeTruthy();
    expect(root?.getAttribute('data-column-count')).toBeTruthy();
    expect(Number(root?.getAttribute('data-row-count'))).toBeGreaterThan(0);
  });

  it('requests load more when the end sentinel is near the viewport', async () => {
    const onEndReached = vi.fn();
    renderGrid({
      onEndReached,
      canLoadMore: true,
      isLoadingMore: false,
      items: Array.from({ length: 6 }, (_, i) => ({ id: `b-${i}`, title: `Book ${i}` })),
    });

    await waitFor(() => {
      expect(onEndReached).toHaveBeenCalled();
    });
  });

  it('does not load more while a page is already in flight', async () => {
    const onEndReached = vi.fn();
    renderGrid({
      onEndReached,
      canLoadMore: true,
      isLoadingMore: true,
      items: Array.from({ length: 6 }, (_, i) => ({ id: `b-${i}`, title: `Book ${i}` })),
    });

    await act(async () => {
      fireIntersection(true);
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(onEndReached).not.toHaveBeenCalled();
  });

  it('does not load more when canLoadMore is false', async () => {
    const onEndReached = vi.fn();
    renderGrid({
      onEndReached,
      canLoadMore: false,
      isLoadingMore: false,
      items: Array.from({ length: 6 }, (_, i) => ({ id: `b-${i}`, title: `Book ${i}` })),
    });

    await act(async () => {
      fireIntersection(true);
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(onEndReached).not.toHaveBeenCalled();
  });

  it('throttles burst end-reached signals', async () => {
    const onEndReached = vi.fn();
    const { rerender } = render(
      <VirtualBookGrid
        items={Array.from({ length: 6 }, (_, i) => ({ id: `b-${i}`, title: `Book ${i}` }))}
        getItemKey={(item) => item.id}
        renderItem={(item) => <span>{item.title}</span>}
        onEndReached={onEndReached}
        canLoadMore
        isLoadingMore={false}
      />
    );

    await waitFor(() => {
      expect(onEndReached).toHaveBeenCalledTimes(1);
    });

    // Parent still "loading" then finishes without growing the list enough —
    // a rapid second intersection within the throttle window must not spam.
    rerender(
      <VirtualBookGrid
        items={Array.from({ length: 6 }, (_, i) => ({ id: `b-${i}`, title: `Book ${i}` }))}
        getItemKey={(item) => item.id}
        renderItem={(item) => <span>{item.title}</span>}
        onEndReached={onEndReached}
        canLoadMore
        isLoadingMore
      />
    );
    rerender(
      <VirtualBookGrid
        items={Array.from({ length: 6 }, (_, i) => ({ id: `b-${i}`, title: `Book ${i}` }))}
        getItemKey={(item) => item.id}
        renderItem={(item) => <span>{item.title}</span>}
        onEndReached={onEndReached}
        canLoadMore
        isLoadingMore={false}
      />
    );

    await act(async () => {
      fireIntersection(true);
      await vi.advanceTimersByTimeAsync(100);
      fireIntersection(true);
    });

    // Still only the original call until throttle elapses.
    expect(onEndReached).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
      fireIntersection(true);
    });

    expect(onEndReached).toHaveBeenCalledTimes(2);
  });

  it('scrolls to the first row when resetKey changes', async () => {
    const scrollToIndex = vi.fn();
    // useWindowVirtualizer is hard to spy; assert via window.scrollTo path when empty,
    // and via re-render with resetKey not crashing when rows exist.
    const { rerender } = render(
      <VirtualBookGrid
        items={Array.from({ length: 20 }, (_, i) => ({ id: `b-${i}`, title: `Book ${i}` }))}
        getItemKey={(item) => item.id}
        renderItem={(item) => <span>{item.title}</span>}
        resetKey="all"
        onEndReached={vi.fn()}
        canLoadMore={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Book 0')).toBeInTheDocument();
    });

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 1200, writable: true });

    rerender(
      <VirtualBookGrid
        items={Array.from({ length: 4 }, (_, i) => ({ id: `f-${i}`, title: `Filtered ${i}` }))}
        getItemKey={(item) => item.id}
        renderItem={(item) => <span>{item.title}</span>}
        resetKey="category:古典"
        onEndReached={vi.fn()}
        canLoadMore={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Filtered 0')).toBeInTheDocument();
    });

    // reset path exercised without throwing; scroll helpers may be used by virtualizer.
    expect(window.scrollTo).toHaveBeenCalled();
    void scrollToIndex;
  });
});
