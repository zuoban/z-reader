'use client';

import type { ComponentProps } from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
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
        className="paper-motion-panel paper-stack relative z-10 grid w-full max-w-sm gap-4 overflow-hidden rounded-[1.5rem] border border-border bg-background p-5 text-sm text-popover-foreground shadow-md outline-none ring-1 ring-foreground/5"
        style={{
          backgroundColor: 'var(--background)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col gap-1.5">
          <h2 className="font-heading text-base font-semibold leading-tight tracking-tight text-foreground">
            {title}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="-mx-5 -mb-5 flex flex-col-reverse gap-2 border-t border-border/60 bg-background p-4 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            className="min-w-20"
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            className="min-w-24"
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
