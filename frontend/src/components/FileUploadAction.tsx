'use client';

import { useRef } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
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
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={cn('relative min-w-0', wrapperClassName)} data-tooltip={title}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={onChange}
        disabled={disabled}
        hidden
      />
      <Button
        type="button"
        aria-label={title}
        aria-busy={Boolean(statusLabel)}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
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
