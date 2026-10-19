'use client';

import { ArrowDownWideNarrow, Check, ChevronDown } from 'lucide-react';
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
}

export function SortSelector({ value, onChange, className }: SortSelectorProps) {
  const [open, setOpen] = useState(false);

  const currentOption = SORT_OPTIONS.find((opt) => opt.value === value);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label="书籍排序方式"
        title={`排序：${currentOption?.label}`}
        className={cn(
          'app-field group flex w-full items-center justify-center text-sm font-medium hover:bg-secondary sm:justify-between sm:pl-4 sm:pr-3',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <ArrowDownWideNarrow className="h-5 w-5 sm:hidden" aria-hidden="true" />
        <span className="hidden min-w-0 truncate text-foreground sm:block">
          {currentOption?.label}
        </span>
        <ChevronDown
          className={cn(
            'hidden h-4 w-4 shrink-0 text-foreground/50 transition-transform duration-200 sm:block',
            open && 'rotate-180'
          )}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="paper-menu min-w-[10rem] rounded-xl p-1.5"
      >
        {SORT_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
            className={cn(
              'min-h-10 cursor-pointer rounded-lg px-3 py-2 text-sm transition-colors focus:bg-secondary',
              value === option.value
                ? 'bg-secondary font-semibold text-foreground'
                : 'text-foreground/80 hover:bg-secondary hover:text-foreground'
            )}
          >
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {value === option.value && (
              <Check className="ml-auto h-3.5 w-3.5 text-foreground/80" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
