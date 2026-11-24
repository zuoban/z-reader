'use client';

import { useRef } from 'react';
import type { ChangeEvent } from 'react';
import { Button } from '@mantine/core';
import { Loader2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploadActionProps {
  accept: string;
  disabled?: boolean;
  title: string;
  label: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  statusLabel?: string;
  wrapperClassName?: string;
  buttonClassName?: string;
  multiple?: boolean;
}

export function FileUploadAction({
  accept,
  disabled = false,
  title,
  label,
  onChange,
  statusLabel,
  wrapperClassName,
  buttonClassName,
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
        aria-busy={disabled}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        variant="filled"
        size="sm"
        className={cn(
          'h-11 min-w-11 max-w-full select-none rounded-xl border border-transparent',
          'bg-primary px-2.5 pr-3 text-sm font-semibold text-primary-foreground',
          'shadow-[var(--paper-shadow-control)] enabled:cursor-pointer',
          'enabled:hover:bg-[var(--primary-hover)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'motion-safe:transition-[background-color,border-color,color,scale]',
          'motion-safe:enabled:active:scale-[0.98]',
          'disabled:cursor-wait disabled:border-border disabled:bg-secondary',
          'disabled:text-secondary-foreground disabled:opacity-100 disabled:shadow-none',
          buttonClassName
        )}
        classNames={{
          label: 'min-w-0 gap-2',
        }}
      >
        <span
          aria-hidden="true"
          className="grid size-6 shrink-0 place-items-center rounded-md bg-current/10"
        >
          {disabled ? (
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <Upload className="size-3.5" strokeWidth={2} />
          )}
        </span>
        <span className="truncate tabular-nums">{statusLabel ?? label}</span>
      </Button>
    </div>
  );
}
