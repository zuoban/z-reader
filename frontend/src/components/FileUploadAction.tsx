'use client';

import type { ChangeEvent, ComponentProps, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
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
  return (
    <div className={cn('relative min-w-0', wrapperClassName)}>
      <input
        type="file"
        accept={accept}
        onChange={onChange}
        disabled={disabled}
        className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-0"
        title={title}
        aria-label={title}
      />
      <Button
        variant={buttonVariant}
        size={buttonSize}
        className={cn('pointer-events-none', buttonClassName)}
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
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
