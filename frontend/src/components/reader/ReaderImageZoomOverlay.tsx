'use client';

import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react';
import { Minus, Plus, RotateCcw, X } from 'lucide-react';
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
  const isZoomed = imageZoom.scale > READER_MIN_IMAGE_SCALE + 0.01;
  const isMaxZoom = imageZoom.scale >= READER_MAX_IMAGE_SCALE - 0.01;
  const zoomPercent = Math.round(imageZoom.scale * 100);
  const caption = image.alt.trim();

  const surfaceCursor = isZoomed
    ? imageInteracting
      ? 'grabbing'
      : 'grab'
    : 'zoom-in';

  return (
    <div
      aria-modal="true"
      aria-label="图片预览"
      className="reader-image-overlay paper-reveal-soft fixed inset-0 z-[var(--z-reader-overlay)] flex min-h-svh items-center justify-center p-3 sm:p-6"
      data-reader-interactive="true"
      role="dialog"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <button
        aria-label="关闭图片预览"
        autoFocus
        className="reader-image-close absolute right-[max(0.75rem,env(safe-area-inset-right,0px))] top-[max(0.75rem,env(safe-area-inset-top,0px))] z-10 sm:right-5 sm:top-5"
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
        onDoubleClick={onDoubleClick}
        onPointerCancel={onPointerEnd}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={caption || '放大的书籍图片'}
          className="reader-image-zoom-img max-h-full max-w-full select-none rounded-lg object-contain shadow-[0_28px_80px_-28px_rgba(0,0,0,0.85)] ring-1 ring-white/10"
          data-interacting={imageInteracting ? 'true' : undefined}
          draggable={false}
          src={image.src}
          style={{
            transform: `translate3d(${imageZoom.x}px, ${imageZoom.y}px, 0) scale(${imageZoom.scale})`,
          }}
        />
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 bottom-[max(0.875rem,env(safe-area-inset-bottom,0px))] z-10 flex flex-col items-center gap-2 px-4"
        onClick={(event) => event.stopPropagation()}
      >
        {caption ? (
          <p className="reader-image-caption line-clamp-2">{caption}</p>
        ) : null}

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

        <p className="reader-image-hint text-center text-[11px] font-medium tracking-wide text-white/55">
          双击或滚轮缩放 · 拖动查看 · 点击空白或 Esc 关闭
        </p>
      </div>
    </div>
  );
}
