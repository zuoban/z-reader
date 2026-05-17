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
          'group relative flex h-9 w-full max-w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-border/40 bg-background px-9 text-sm transition-all hover:border-border/60 hover:bg-background/80 focus:ring-0',
          mobileIconOnly && 'sm:hidden w-9 justify-center px-0',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <ArrowUpDown className="absolute left-3 h-3.5 w-3.5 shrink-0 text-foreground" />
        {!mobileIconOnly && (
          <>
            <span className="min-w-0 truncate text-center font-medium text-foreground">{currentOption?.label}</span>
            <ChevronDown
              className={cn(
                'absolute right-3 h-3.5 w-3.5 shrink-0 text-foreground transition-all duration-200',
                open && 'rotate-180'
              )}
            />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[140px] rounded-md border border-border/40 bg-background p-1 shadow-md"
      >
        {SORT_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
            className={cn(
              'cursor-pointer rounded-sm px-3 py-2 text-sm focus:bg-muted focus:text-foreground',
              value === option.value
                ? 'bg-muted font-medium text-foreground'
                : 'text-foreground/80 hover:bg-muted hover:text-foreground'
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
