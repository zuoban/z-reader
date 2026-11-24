import { useRef } from 'react';
import { fireEvent, render, screen } from '@/test/render';
import { describe, expect, it } from 'vitest';
import { ReaderImageZoomOverlay } from '@/components/reader/ReaderImageZoomOverlay';
import { useReaderImageZoom } from '@/hooks/useReaderImageZoom';

function ImageZoomHarness({ alt = '封面插画' }: { alt?: string }) {
  const pageRef = useRef<HTMLDivElement>(null);
  const {
    zoomedImage,
    imageZoom,
    imageInteracting,
    imageZoomSurfaceRef,
    handleImageOpen,
    handleImageClose,
    handleImageZoomIn,
    handleImageZoomOut,
    handleImageZoomReset,
    handleImageSurfaceClick,
    handleImageDoubleClick,
    handleImagePointerDown,
    handleImagePointerMove,
    handleImagePointerEnd,
  } = useReaderImageZoom(pageRef);

  return (
    <div ref={pageRef}>
      <button
        type="button"
        onClick={() => handleImageOpen({ src: 'https://example.com/plate.png', alt })}
      >
        打开图片
      </button>
      {zoomedImage ? (
        <ReaderImageZoomOverlay
          image={zoomedImage}
          imageZoom={imageZoom}
          imageInteracting={imageInteracting}
          surfaceRef={imageZoomSurfaceRef}
          onClose={handleImageClose}
          onZoomIn={handleImageZoomIn}
          onZoomOut={handleImageZoomOut}
          onResetZoom={handleImageZoomReset}
          onSurfaceClick={handleImageSurfaceClick}
          onDoubleClick={handleImageDoubleClick}
          onPointerDown={handleImagePointerDown}
          onPointerMove={handleImagePointerMove}
          onPointerEnd={handleImagePointerEnd}
        />
      ) : null}
    </div>
  );
}

describe('ReaderImageZoomOverlay', () => {
  it('supports zoom controls, keyboard shortcuts, caption rendering, and focus restore', () => {
    render(<ImageZoomHarness alt="第一章插图" />);

    const trigger = screen.getByRole('button', { name: '打开图片' });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole('dialog', { name: '图片预览' })).toBeInTheDocument();
    expect(screen.getByText('第一章插图')).toBeInTheDocument();

    const zoomOut = screen.getByRole('button', { name: '缩小图片' });
    const zoomIn = screen.getByRole('button', { name: '放大图片' });
    const reset = screen.getByRole('button', { name: '当前 100%' });

    expect(zoomOut).toBeDisabled();
    expect(reset).toBeDisabled();
    expect(zoomIn).toBeEnabled();

    fireEvent.click(zoomIn);
    expect(screen.getByRole('button', { name: '重置缩放（当前 150%）' })).toBeEnabled();
    expect(zoomOut).toBeEnabled();

    fireEvent.keyDown(window, { key: '+' });
    expect(screen.getByRole('button', { name: '重置缩放（当前 200%）' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: '-' });
    expect(screen.getByRole('button', { name: '重置缩放（当前 150%）' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: '0' });
    expect(screen.getByRole('button', { name: '当前 100%' })).toBeDisabled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '图片预览' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it('toggles zoom once on mouse double-click and closes only when clicking empty backdrop', () => {
    render(<ImageZoomHarness alt="" />);

    fireEvent.click(screen.getByRole('button', { name: '打开图片' }));

    const surface = screen.getByTestId('reader-image-zoom-surface');
    const img = screen.getByRole('img', { name: '放大的书籍图片' });

    expect(surface).toHaveStyle({ cursor: 'zoom-in' });

    // Clicking the image itself keeps the overlay open
    fireEvent.click(img);
    expect(screen.getByRole('dialog', { name: '图片预览' })).toBeInTheDocument();

    // Double clicking toggles cleanly from 100% -> 250% -> 100%
    fireEvent.doubleClick(img, { clientX: 512, clientY: 384 });
    expect(screen.getByRole('button', { name: '重置缩放（当前 250%）' })).toBeInTheDocument();
    expect(surface).toHaveStyle({ cursor: 'grab' });

    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: 'mouse', clientX: 500, clientY: 380 });
    expect(surface).toHaveStyle({ cursor: 'grabbing' });
    fireEvent.pointerMove(surface, { pointerId: 1, pointerType: 'mouse', clientX: 540, clientY: 380 });
    fireEvent.pointerUp(surface, { pointerId: 1, pointerType: 'mouse', clientX: 540, clientY: 380 });

    // Click right after a drag should not accidentally close the overlay
    fireEvent.click(surface);
    expect(screen.getByRole('dialog', { name: '图片预览' })).toBeInTheDocument();

    // Double click again resets to 100%
    fireEvent.doubleClick(img, { clientX: 512, clientY: 384 });
    expect(screen.getByRole('button', { name: '当前 100%' })).toBeDisabled();

    // Clicking the empty surface around the image closes the overlay
    fireEvent.click(surface);
    expect(screen.queryByRole('dialog', { name: '图片预览' })).not.toBeInTheDocument();
  });

  it('traps Tab focus inside the modal and shows a graceful fallback on image load error', () => {
    render(<ImageZoomHarness alt="插图说明" />);

    fireEvent.click(screen.getByRole('button', { name: '打开图片' }));
    const dialog = screen.getByRole('dialog', { name: '图片预览' });
    const closeButton = screen.getByRole('button', { name: '关闭图片预览' });
    const zoomInButton = screen.getByRole('button', { name: '放大图片' });

    expect(closeButton).toHaveFocus();

    // Shift+Tab from the first focusable wraps to the last enabled button (zoomIn at 100%)
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(zoomInButton).toHaveFocus();

    // Tab from the last enabled button wraps back to closeButton
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(closeButton).toHaveFocus();

    // Image load error swaps in a fallback card and hides zoom controls
    fireEvent.error(screen.getByRole('img', { name: '插图说明' }));
    expect(screen.getByText('图片暂时无法加载')).toBeVisible();
    expect(screen.queryByRole('group', { name: '图片缩放控制' })).not.toBeInTheDocument();
  });
});
