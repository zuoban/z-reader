import { fireEvent, render, screen } from '@/test/render';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ShelfScrollToTop } from '@/components/shelf/ShelfScrollToTop';

describe('ShelfScrollToTop', () => {
  const originalScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY');
  const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
  const originalScrollHeight = Object.getOwnPropertyDescriptor(
    document.documentElement,
    'scrollHeight',
  );

  function setViewportMetrics({
    scrollY,
    innerHeight,
    scrollHeight,
  }: {
    scrollY: number;
    innerHeight: number;
    scrollHeight: number;
  }) {
    Object.defineProperty(window, 'scrollY', { value: scrollY, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true });
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: scrollHeight,
      configurable: true,
    });
  }

  afterEach(() => {
    if (originalScrollY) {
      Object.defineProperty(window, 'scrollY', originalScrollY);
    }
    if (originalInnerHeight) {
      Object.defineProperty(window, 'innerHeight', originalInnerHeight);
    }
    if (originalScrollHeight) {
      Object.defineProperty(document.documentElement, 'scrollHeight', originalScrollHeight);
    }
    vi.restoreAllMocks();
  });

  it('shows progress ring after scrolling past threshold and scrolls to top on click', () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    setViewportMetrics({ scrollY: 300, innerHeight: 800, scrollHeight: 2000 });

    render(<ShelfScrollToTop />);
    expect(screen.queryByRole('button', { name: '回到顶部' })).not.toBeInTheDocument();

    setViewportMetrics({ scrollY: 600, innerHeight: 800, scrollHeight: 2000 });
    fireEvent.scroll(window);

    const button = screen.getByRole('button', { name: '回到顶部' });
    expect(button).toHaveAttribute('data-scroll-progress', '50');
    expect(button.querySelector('circle')).toBeInTheDocument();

    fireEvent.click(button);
    expect(scrollToSpy).toHaveBeenCalledWith({
      top: 0,
      behavior: expect.stringMatching(/auto|smooth/),
    });
  });
});
