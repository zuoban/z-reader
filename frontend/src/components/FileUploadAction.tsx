'use client';

import { useRef } from 'react';
import type { ChangeEvent } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploadActionProps {
  accept: string;
  disabled?: boolean;
  title: string;
  label: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  statusLabel?: string;
  density?: 'header' | 'prominent';
  emphasis?: 'primary' | 'secondary';
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
  density = 'prominent',
  emphasis = 'primary',
  wrapperClassName,
  buttonClassName,
  multiple = false,
}: FileUploadActionProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={cn('relative min-w-0', wrapperClassName)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={onChange}
        disabled={disabled}
        hidden
      />
      <button
        type="button"
        title={title}
        aria-label={title}
        aria-busy={disabled}
        disabled={disabled}
        data-density={density}
        onClick={() => inputRef.current?.click()}
        className={cn('upload-action-trigger group', buttonClassName)}
      >
        <span
          data-upload-surface="true"
          data-density={density}
          data-emphasis={emphasis}
          className="upload-action-surface"
        >
          {disabled ? (
            <Loader2
              aria-hidden="true"
              className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
              strokeWidth={1.75}
            />
          ) : (
            <Upload
              aria-hidden="true"
              className={cn(
                'size-4 shrink-0',
                emphasis === 'secondary' &&
                  'text-muted-foreground transition-colors group-hover:text-foreground'
              )}
              strokeWidth={1.75}
            />
          )}
          <span className="truncate tabular-nums">{statusLabel ?? label}</span>
        </span>
      </button>
    </div>
  );
}
