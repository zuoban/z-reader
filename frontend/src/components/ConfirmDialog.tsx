'use client';

import type { ComponentProps } from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ButtonVariant = ComponentProps<typeof Button>['variant'];

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: ButtonVariant;
  confirmDisabled?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = '取消',
  confirmVariant = 'destructive',
  confirmDisabled = false,
  onConfirm,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onOpenChange, open]);

  const portalRoot = typeof document === 'undefined' ? null : document.body;

  if (!portalRoot || !open) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex min-h-svh items-center justify-center p-4"
      role="presentation"
      onClick={() => onOpenChange(false)}
    >
      <div className="paper-motion-veil absolute inset-0 bg-black/42 backdrop-blur-[3px]" />
      <div
        aria-modal="true"
        role="alertdialog"
        className="app-dialog-shell paper-motion-panel paper-texture relative z-10 grid w-full max-w-[21rem] overflow-hidden rounded-2xl border p-5 text-sm text-popover-foreground outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-destructive/18 bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
            <h2 className="font-heading text-[15px] font-semibold leading-tight tracking-[-0.015em] text-foreground">
              {title}
            </h2>
            <p className="text-[13px] leading-5 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <Button
            variant="outline"
            className="h-10 rounded-xl text-foreground/85"
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            className={cn(
              'h-10 rounded-xl font-semibold',
              confirmVariant === 'destructive' && 'text-destructive-foreground'
            )}
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    portalRoot
  );
}
