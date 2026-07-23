'use client';

import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react';
import { X } from 'lucide-react';
import type { ReaderImageZoomState } from '@/lib/reader-page';

interface ReaderImageZoomOverlayProps {
  image: { src: string; alt: string };
  imageZoom: ReaderImageZoomState;
  imageInteracting: boolean;
  surfaceRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onToggleZoom: (clientX: number, clientY: number) => void;
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
  onToggleZoom,
  onDoubleClick,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
}: ReaderImageZoomOverlayProps) {
  return (
    <div
      aria-modal="true"
      aria-label="图片预览"
      className="fixed inset-0 z-[var(--z-reader-overlay)] flex min-h-svh items-center justify-center p-3 sm:p-6"
      data-reader-interactive="true"
      role="dialog"
      style={{
        background: `
          radial-gradient(ellipse at center, rgba(40,32,24,0.42) 0%, transparent 62%),
          rgba(20,18,16,0.88)
        `,
        backdropFilter: 'blur(8px) saturate(1.05)',
      }}
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
        className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/18 bg-black/35 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_28px_-18px_rgba(0,0,0,0.75)] transition-all hover:scale-[1.04] hover:bg-black/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 sm:right-5 sm:top-5"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        <X className="h-5 w-5" />
      </button>
      <div
        ref={surfaceRef}
        className="flex h-full w-full touch-none items-center justify-center overflow-hidden"
        style={{
          cursor: imageZoom.scale > 1 ? 'grab' : 'zoom-in',
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (event.detail >= 2) {
            onToggleZoom(event.clientX, event.clientY);
          }
        }}
        onDoubleClick={onDoubleClick}
        onPointerCancel={onPointerEnd}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={image.alt || '放大的书籍图片'}
          className="max-h-full max-w-full select-none rounded-lg object-contain shadow-[0_28px_80px_-28px_rgba(0,0,0,0.85)] ring-1 ring-white/10"
          draggable={false}
          src={image.src}
          style={{
            transform: `translate3d(${imageZoom.x}px, ${imageZoom.y}px, 0) scale(${imageZoom.scale})`,
            transition: imageInteracting
              ? 'none'
              : 'transform 160ms cubic-bezier(0.32, 0.72, 0, 1)',
          }}
        />
      </div>
      <p className="reader-image-hint pointer-events-none absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] text-center text-[11px] font-medium tracking-wide text-white/60">
        双击缩放 · 拖动查看 · Esc 关闭
      </p>
    </div>
  );
}
