'use client';

import { useCallback, useId, useLayoutEffect, useRef } from 'react';
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
  const descriptionId = useId();
  const contentNodeRef = useRef<HTMLElement | null>(null);

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
  }, [open, applyAlertDialogAttributes, confirmDisabled, title, description]);

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
      onClose={() => onOpenChange(false)}
      centered
      size={336}
      radius="lg"
      padding={0}
      zIndex={95}
      transitionProps={{ duration: 160, transition: 'fade' }}
    >
      <Modal.Overlay backgroundOpacity={0.42} blur={3} />
      <Modal.Content
        ref={handleContentRef}
        className="app-dialog-shell overflow-hidden rounded-2xl border p-5 text-sm text-popover-foreground outline-none"
      >
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-destructive/20 bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" strokeWidth={1.5} />
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
            className="h-10 rounded-lg text-foreground/85"
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={mantineVariant}
            color={confirmVariant === 'destructive' ? 'red' : undefined}
            className={cn(
              'h-10 rounded-lg font-medium',
              confirmVariant === 'destructive' &&
                'bg-destructive text-destructive-foreground hover:bg-destructive/90'
            )}
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </div>
      </Modal.Content>
    </Modal.Root>
  );
}
