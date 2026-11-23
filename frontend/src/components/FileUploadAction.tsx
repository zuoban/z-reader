'use client';

import { useId, useRef } from 'react';
import type { ChangeEvent, KeyboardEvent, ReactNode } from 'react';
import { Button, type ButtonProps } from '@mantine/core';
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
  buttonVariant?: ButtonProps['variant'];
  buttonSize?: ButtonProps['size'];
  multiple?: boolean;
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
  buttonVariant = 'filled',
  buttonSize = 'sm',
  multiple = false,
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
        multiple={multiple}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
        tabIndex={-1}
      />
      <Button
        component="label"
        htmlFor={disabled ? undefined : inputId}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={title}
        aria-disabled={disabled}
        aria-busy={Boolean(statusLabel)}
        data-disabled={disabled || undefined}
        onKeyDown={handleKeyDown}
        variant={buttonVariant}
        size={buttonSize}
        radius="md"
        className={cn(
          'cursor-pointer select-none shadow-[var(--paper-shadow-control)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          disabled && 'pointer-events-none opacity-50',
          buttonClassName
        )}
        classNames={{
          label: 'inline-flex items-center justify-center gap-1.5',
        }}
      >
        {children}
      </Button>
      {statusLabel && (
        <span className="paper-chip pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none text-primary shadow-sm">
          {statusLabel}
        </span>
      )}
    </div>
  );
}
