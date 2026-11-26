'use client';

import type { ReactNode } from 'react';
import { ActionIcon, Modal } from '@mantine/core';
import '@/app/styles/mantine-modal.css';
import { X } from 'lucide-react';
import { useComposingEscapeGuard } from '@/hooks/useComposingEscapeGuard';
import { cn } from '@/lib/utils';

export interface AppModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  subtitleClassName?: string;
  icon: ReactNode;
  size?: number;
  zIndex?: number;
  returnFocus?: boolean;
  closeDisabled?: boolean;
  closeOnClickOutside?: boolean;
  closeOnEscape?: boolean;
  closeLabel?: string;
  contentClassName?: string;
  guardComposingEscape?: boolean;
  children: ReactNode;
}

export function AppModal({
  open,
  onClose,
  title,
  subtitle,
  subtitleClassName,
  icon,
  size = 440,
  zIndex,
  returnFocus,
  closeDisabled = false,
  closeOnClickOutside = !closeDisabled,
  closeOnEscape = !closeDisabled,
  closeLabel = '关闭',
  contentClassName,
  guardComposingEscape = true,
  children,
}: AppModalProps) {
  useComposingEscapeGuard(open && guardComposingEscape);

  return (
    <Modal.Root
      opened={open}
      onClose={onClose}
      size={size}
      zIndex={zIndex}
      returnFocus={returnFocus}
      closeOnClickOutside={closeOnClickOutside}
      closeOnEscape={closeOnEscape}
      classNames={{
        inner:
          'pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]',
        content: cn(
          'app-dialog-shell flex flex-col overflow-hidden overscroll-contain rounded-2xl border p-0',
          contentClassName ?? 'max-h-[min(82svh,34rem)]',
        ),
      }}
    >
      <Modal.Overlay />
      <Modal.Content>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="app-sheet-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/15">
              {icon}
            </div>
            <div className="min-w-0">
              <Modal.Title className="font-heading text-[17px] font-medium leading-tight text-foreground">
                {title}
              </Modal.Title>
              {subtitle ? (
                <p
                  className={cn(
                    'mt-0.5 truncate text-xs leading-5 text-muted-foreground',
                    subtitleClassName,
                  )}
                >
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>
          <ActionIcon
            variant="subtle"
            color="gray"
            size={36}
            radius="md"
            disabled={closeDisabled}
            onClick={onClose}
            className="dialog-close-btn -mr-1 h-9 w-9 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={closeLabel}
            title="关闭 (Esc)"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </ActionIcon>
        </div>

        {children}
      </Modal.Content>
    </Modal.Root>
  );
}
