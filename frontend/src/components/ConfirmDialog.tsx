'use client';

import type { ComponentProps } from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
      className="fixed inset-0 z-[80] flex min-h-svh items-center justify-center p-4"
      role="presentation"
      onClick={() => onOpenChange(false)}
    >
      <div className="paper-motion-veil absolute inset-0 bg-black/45" />
      <div
        aria-modal="true"
        role="alertdialog"
        className="app-dialog-shell paper-motion-panel paper-stack relative z-10 grid w-full max-w-sm overflow-hidden rounded-[1.5rem] border text-sm text-popover-foreground outline-none ring-1 ring-foreground/5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex gap-3 px-5 pb-5 pt-5">
          <div className="app-dialog-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
            <h2 className="font-heading text-base font-semibold leading-tight tracking-tight text-foreground">
              {title}
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        <div className="app-dialog-footer flex flex-col-reverse gap-2 p-4 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            className="h-9 min-w-20 rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            className="h-9 min-w-24 rounded-xl"
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
