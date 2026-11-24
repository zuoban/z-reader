'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Button, Modal } from '@mantine/core';
import { AlertTriangle } from 'lucide-react';
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
        content: 'app-dialog-shell overscroll-contain rounded-2xl border p-5 text-sm text-popover-foreground outline-none',
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
            <Modal.Title className="font-heading text-base font-medium leading-tight text-foreground">
              {title}
            </Modal.Title>
            <p id={descriptionId} className="text-[13px] leading-5 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <Button
            type="button"
            variant="default"
            className="h-10 cursor-pointer rounded-lg text-foreground/85 hover:bg-secondary disabled:cursor-not-allowed"
            onClick={handleClose}
            disabled={isBusy}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={mantineVariant}
            color={isDestructive ? 'red' : undefined}
            className={cn(
              'h-10 cursor-pointer rounded-lg font-medium disabled:cursor-not-allowed',
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
