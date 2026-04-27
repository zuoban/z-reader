'use client';

import { ArrowUpDown, Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { SORT_OPTIONS, SortOption } from '@/hooks/useShelfData';

interface SortSelectorProps {
  value: SortOption;
  onChange: (value: SortOption) => void;
  className?: string;
  mobileIconOnly?: boolean;
}

export function SortSelector({ value, onChange, className, mobileIconOnly }: SortSelectorProps) {
  const [open, setOpen] = useState(false);

  const currentOption = SORT_OPTIONS.find((opt) => opt.value === value);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label="书籍排序方式"
        className={cn(
          'group relative flex h-9 w-full max-w-full cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl border border-primary/12 bg-shelf-surface-soft px-3 text-sm text-foreground/80 transition-all duration-200 hover:border-primary/22 hover:bg-shelf-surface-hover hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 sm:w-[11rem]',
          mobileIconOnly && 'sm:hidden w-9 justify-center px-0',
          open && 'border-primary/28 bg-shelf-surface-selected text-foreground',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <ArrowUpDown className="h-4 w-4 shrink-0 text-primary/60 transition-colors group-hover:text-primary/80" />
        {!mobileIconOnly && (
          <>
            <span className="min-w-0 truncate font-medium">{currentOption?.label}</span>
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 shrink-0 text-primary/40 transition-all duration-200 group-hover:text-primary/60',
                open && 'rotate-180 text-primary/70'
              )}
            />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[140px] rounded-xl border border-primary/14 bg-[var(--shelf-surface-raised)] p-1.5 shadow-[0_10px_30px_-16px_var(--paper-shadow),0_4px_12px_-8px_var(--paper-shadow-soft)] ring-1 ring-primary/6"
        style={{
          backgroundColor: 'var(--shelf-surface-raised)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
        }}
      >
        {SORT_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
            className={cn(
              'cursor-pointer rounded-lg px-3 py-2 pr-8 text-sm focus:bg-[var(--shelf-surface-selected)] focus:text-foreground',
              value === option.value
                ? 'bg-[var(--shelf-surface-selected)] font-medium text-foreground'
                : 'text-foreground/62 hover:bg-[var(--shelf-surface-hover)] hover:text-foreground'
            )}
          >
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {value === option.value && (
              <Check className="absolute right-2 h-3.5 w-3.5 text-foreground/80" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
