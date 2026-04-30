'use client';

import { useId, useRef } from 'react';
import type { ChangeEvent, ComponentProps, KeyboardEvent, ReactNode } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FileUploadActionProps {
  accept: string;
  disabled?: boolean;
  title: string;
  children: ReactNode;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  statusLabel?: string;
  wrapperClassName?: string;
  buttonClassName?: string;
  buttonVariant?: ComponentProps<typeof Button>['variant'];
  buttonSize?: ComponentProps<typeof Button>['size'];
}

export function FileUploadAction({
  accept,
  disabled = false,
  title,
  children,
  onChange,
  statusLabel,
  wrapperClassName,
  buttonClassName,
  buttonVariant = 'default',
  buttonSize = 'default',
}: FileUploadActionProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLLabelElement>) {
    if (disabled || (event.key !== 'Enter' && event.key !== ' ')) return;

    event.preventDefault();
    inputRef.current?.click();
  }

  return (
    <div className={cn('relative min-w-0', wrapperClassName)} data-tooltip={title}>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
        aria-label={title}
      />
      <label
        htmlFor={disabled ? undefined : inputId}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={title}
        aria-disabled={disabled}
        onKeyDown={handleKeyDown}
        className={cn(
          buttonVariants({ variant: buttonVariant, size: buttonSize }),
          disabled && 'pointer-events-none opacity-50',
          buttonClassName
        )}
      >
        {children}
      </label>
      {statusLabel && (
        <span className="paper-chip pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none text-primary shadow-sm">
          {statusLabel}
        </span>
      )}
    </div>
  );
}
