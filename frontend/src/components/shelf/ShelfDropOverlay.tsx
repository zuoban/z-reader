'use client';

import { Loader2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SUPPORTED_FORMAT_LABELS } from './constants';

export interface ShelfDropOverlayProps {
  isUploading: boolean;
}

export function ShelfDropOverlay({ isUploading }: ShelfDropOverlayProps) {
  return (
    <div
      aria-live="polite"
      className="shelf-dropzone-overlay paper-reveal-soft pointer-events-none fixed inset-0 z-40 flex items-center justify-center p-6"
    >
      <div
        className={cn(
          'paper-panel w-full max-w-sm rounded-3xl border-2 border-dashed px-8 py-9 text-center shadow-[var(--paper-shadow-floating)]',
          isUploading ? 'border-border' : 'border-primary/50 bg-card/95'
        )}
      >
        <div className="app-sheet-icon mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20">
          {isUploading ? (
            <Loader2
              className="h-5 w-5 animate-spin motion-reduce:animate-none"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          ) : (
            <Upload className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" />
          )}
        </div>
        <p className="mt-4 font-heading text-lg font-medium tracking-[-0.01em] text-foreground">
          {isUploading ? '正在上传图书，请稍候' : '松开即可批量导入'}
        </p>
        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
          {isUploading
            ? '请等待当前上传完成后再拖入新文件'
            : '支持批量导入常见电子书格式'}
        </p>
        {!isUploading && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
            {SUPPORTED_FORMAT_LABELS.map((format) => (
              <span key={format} className="shelf-format-pill">
                {format}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
