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
      className="fixed inset-0 z-[80] flex min-h-svh items-center justify-center p-4"
      role="presentation"
      onClick={() => onOpenChange(false)}
    >
      <div className="paper-motion-veil absolute inset-0 bg-black/38 backdrop-blur-[2px]" />
      <div
        aria-modal="true"
        role="alertdialog"
        className="paper-motion-panel relative z-10 grid w-full max-w-[21rem] overflow-hidden rounded-2xl border border-border/65 bg-popover/98 p-5 text-sm text-popover-foreground shadow-[0_24px_70px_-38px_var(--paper-shadow),0_10px_32px_-28px_var(--paper-shadow-soft)] outline-none ring-1 ring-white/45 backdrop-blur-md dark:ring-white/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-destructive/16 bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
            <h2 className="font-heading text-[15px] font-semibold leading-tight tracking-tight text-foreground">
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
            className="h-10 rounded-xl border-border/65 bg-background/60 text-foreground/82 hover:bg-muted/70 hover:text-foreground"
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            className={cn(
              'h-10 rounded-xl font-semibold',
              confirmVariant === 'destructive'
                ? 'bg-destructive text-background shadow-[0_10px_24px_-18px_var(--destructive)] hover:bg-destructive/90'
                : ''
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
