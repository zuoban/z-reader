'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Button, Modal } from '@mantine/core';
import '@/app/styles/mantine-modal.css';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type ConfirmVariant = 'destructive' | 'default' | 'outline' | 'secondary' | 'ghost';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: ConfirmVariant;
  confirmDisabled?: boolean;
  loading?: boolean;
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
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const descriptionId = useId();
  const contentNodeRef = useRef<HTMLElement | null>(null);
  const mountedRef = useRef(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const isBusy = loading || isSubmitting;
  const isDestructive = confirmVariant === 'destructive';

  const applyAlertDialogAttributes = useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;
      node.setAttribute('role', 'alertdialog');
      node.setAttribute('aria-describedby', descriptionId);
    },
    [descriptionId]
  );

  const handleContentRef = useCallback(
    (node: HTMLElement | null) => {
      contentNodeRef.current = node;
      applyAlertDialogAttributes(node);
    },
    [applyAlertDialogAttributes]
  );

  useLayoutEffect(() => {
    if (!open) return;
    applyAlertDialogAttributes(contentNodeRef.current);
  }, [open, applyAlertDialogAttributes, confirmDisabled, isBusy, title, description]);

  const handleClose = useCallback(() => {
    if (isBusy) return;
    onOpenChange(false);
  }, [isBusy, onOpenChange]);

  const handleConfirmClick = useCallback(async () => {
    if (confirmDisabled || isBusy) return;
    const result = onConfirm();
    if (result && typeof (result as Promise<void>).then === 'function') {
      setIsSubmitting(true);
      try {
        await result;
      } finally {
        if (mountedRef.current) {
          setIsSubmitting(false);
        }
      }
    }
  }, [confirmDisabled, isBusy, onConfirm]);

  const mantineVariant =
    confirmVariant === 'outline'
      ? 'default'
      : confirmVariant === 'secondary'
        ? 'light'
        : confirmVariant === 'ghost'
          ? 'subtle'
          : 'filled';

  return (
    <Modal.Root
      opened={open}
      onClose={handleClose}
      centered
      size={344}
      radius="lg"
      padding={0}
      zIndex={95}
      closeOnClickOutside={!isBusy}
      closeOnEscape={!isBusy}
      transitionProps={{ duration: 160, transition: 'fade' }}
      classNames={{
        inner:
          'pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))]',
        content:
          'app-dialog-shell overscroll-contain rounded-2xl border p-5 text-sm text-popover-foreground outline-none',
      }}
    >
      <Modal.Overlay backgroundOpacity={0.42} blur={3} />
      <Modal.Content ref={handleContentRef}>
        <div className="flex gap-3">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
              isDestructive
                ? 'border-destructive/20 bg-destructive/10 text-destructive'
                : 'app-sheet-icon border-primary/15'
            )}
          >
            <AlertTriangle className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
            <Modal.Title className="break-words font-heading text-base font-medium leading-tight text-foreground">
              {title}
            </Modal.Title>
            <p
              id={descriptionId}
              className="break-words text-[13px] leading-5 text-muted-foreground"
            >
              {description}
            </p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <Button
            type="button"
            variant="default"
            data-autofocus={isDestructive ? true : undefined}
            className="h-10 cursor-pointer rounded-lg text-foreground/85 transition-[background-color,border-color,color,transform] hover:bg-secondary active:scale-[0.98] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-55"
            onClick={handleClose}
            disabled={isBusy}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={mantineVariant}
            color={isDestructive ? 'red' : undefined}
            leftSection={
              isBusy ? (
                <Loader2
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : undefined
            }
            className={cn(
              'h-10 cursor-pointer rounded-lg font-medium transition-[background-color,border-color,color,transform,opacity] active:scale-[0.98] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-60',
              isDestructive &&
                'bg-destructive text-destructive-foreground hover:bg-destructive/90'
            )}
            onClick={() => void handleConfirmClick()}
            disabled={confirmDisabled || isBusy}
            aria-busy={isBusy || undefined}
          >
            {confirmLabel}
          </Button>
        </div>
      </Modal.Content>
    </Modal.Root>
  );
}
