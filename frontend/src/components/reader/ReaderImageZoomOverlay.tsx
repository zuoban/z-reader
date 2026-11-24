'use client';

import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { ImageOff, Minus, Plus, RotateCcw, X } from 'lucide-react';
import {
  READER_MAX_IMAGE_SCALE,
  READER_MIN_IMAGE_SCALE,
  type ReaderImageZoomState,
} from '@/lib/reader-page';

interface ReaderImageZoomOverlayProps {
  image: { src: string; alt: string };
  imageZoom: ReaderImageZoomState;
  imageInteracting: boolean;
  surfaceRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onSurfaceClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onDoubleClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

export function ReaderImageZoomOverlay({
  image,
  imageZoom,
  imageInteracting,
  surfaceRef,
  onClose,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onSurfaceClick,
  onDoubleClick,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
}: ReaderImageZoomOverlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const hasLoadError = failedSrc === image.src;
  const isZoomed = imageZoom.scale > READER_MIN_IMAGE_SCALE + 0.01;
  const isMaxZoom = imageZoom.scale >= READER_MAX_IMAGE_SCALE - 0.01;
  const zoomPercent = Math.round(imageZoom.scale * 100);
  const caption = image.alt.trim();

  const surfaceCursor = hasLoadError
    ? 'default'
    : isZoomed
      ? imageInteracting
        ? 'grabbing'
        : 'grab'
      : 'zoom-in';

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusables = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (event.shiftKey) {
      if (!active || active === first || !dialogRef.current?.contains(active)) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (!active || active === last || !dialogRef.current?.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      ref={dialogRef}
      aria-modal="true"
      aria-label="图片预览"
      className="reader-image-overlay paper-reveal-soft fixed inset-0 z-[var(--z-reader-overlay)] flex min-h-svh items-center justify-center pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:pl-[max(1.5rem,env(safe-area-inset-left,0px))] sm:pr-[max(1.5rem,env(safe-area-inset-right,0px))] sm:pt-[max(1.5rem,env(safe-area-inset-top,0px))] sm:pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]"
      data-reader-interactive="true"
      role="dialog"
      onClick={onClose}
      onKeyDown={handleDialogKeyDown}
    >
      {!hasLoadError && (
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          当前缩放 {zoomPercent}%
        </div>
      )}

      <button
        aria-label="关闭图片预览"
        autoFocus
        className="reader-image-close absolute right-[max(0.75rem,env(safe-area-inset-right,0px))] top-[max(0.75rem,env(safe-area-inset-top,0px))] z-10 sm:right-[max(1.25rem,env(safe-area-inset-right,0px))] sm:top-[max(1.25rem,env(safe-area-inset-top,0px))]"
        title="关闭图片预览（Esc）"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>

      <div
        ref={surfaceRef}
        className="flex h-full w-full touch-none items-center justify-center overflow-hidden pb-20 pt-14 sm:pb-24 sm:pt-16"
        data-testid="reader-image-zoom-surface"
        style={{ cursor: surfaceCursor }}
        onClick={onSurfaceClick}
        onDoubleClick={hasLoadError ? undefined : onDoubleClick}
        onPointerCancel={hasLoadError ? undefined : onPointerEnd}
        onPointerDown={hasLoadError ? undefined : onPointerDown}
        onPointerMove={hasLoadError ? undefined : onPointerMove}
        onPointerUp={hasLoadError ? undefined : onPointerEnd}
      >
        {hasLoadError ? (
          <div
            role="alert"
            className="flex max-w-xs flex-col items-center gap-2.5 rounded-2xl border border-white/15 bg-black/55 px-6 py-6 text-center text-white/85 backdrop-blur-md"
            onClick={(event) => event.stopPropagation()}
          >
            <ImageOff className="h-6 w-6 text-white/65" strokeWidth={1.6} aria-hidden="true" />
            <p className="text-sm font-medium">图片暂时无法加载</p>
            <p className="text-xs leading-5 text-white/60">
              点击空白处或按 Esc 返回阅读
            </p>
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            alt={caption || '放大的书籍图片'}
            className="reader-image-zoom-img max-h-full max-w-full select-none rounded-lg object-contain shadow-[0_28px_80px_-28px_rgba(0,0,0,0.85)] ring-1 ring-white/10"
            data-interacting={imageInteracting ? 'true' : undefined}
            draggable={false}
            src={image.src}
            style={{
              transform: `translate3d(${imageZoom.x}px, ${imageZoom.y}px, 0) scale(${imageZoom.scale})`,
            }}
            onLoad={() => {
              if (failedSrc === image.src) setFailedSrc(null);
            }}
            onError={() => setFailedSrc(image.src)}
          />
        )}
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 bottom-[max(0.875rem,env(safe-area-inset-bottom,0px))] z-10 flex flex-col items-center gap-2 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]"
        onClick={(event) => event.stopPropagation()}
      >
        {caption ? (
          <p className="reader-image-caption line-clamp-2">{caption}</p>
        ) : null}

        {!hasLoadError && (
          <>
            <div
              aria-label="图片缩放控制"
              className="reader-image-dock pointer-events-auto"
              role="group"
            >
              <button
                aria-label="缩小图片"
                className="reader-image-control"
                disabled={!isZoomed}
                title="缩小（-）"
                type="button"
                onClick={onZoomOut}
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>

              <button
                aria-label={isZoomed ? `重置缩放（当前 ${zoomPercent}%）` : '当前 100%'}
                className="reader-image-control min-w-[3.75rem] gap-1 px-2.5 tabular-nums"
                disabled={!isZoomed}
                title={isZoomed ? '重置为 100%（0）' : '原始尺寸'}
                type="button"
                onClick={onResetZoom}
              >
                {isZoomed ? (
                  <RotateCcw className="h-3 w-3 opacity-80" aria-hidden="true" />
                ) : null}
                <span>{zoomPercent}%</span>
              </button>

              <button
                aria-label="放大图片"
                className="reader-image-control"
                disabled={isMaxZoom}
                title="放大（+）"
                type="button"
                onClick={onZoomIn}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <p className="reader-image-hint select-none text-center text-[11px] font-medium tracking-wide text-white/55 sm:hidden">
              双击或双指缩放 · 拖动查看 · 点击空白关闭
            </p>
            <p className="reader-image-hint hidden select-none text-center text-[11px] font-medium tracking-wide text-white/55 sm:block">
              双击或滚轮缩放 · 拖动查看 · 点击空白或 Esc 关闭
            </p>
          </>
        )}
      </div>
    </div>
  );
}
