'use client';

import { ArrowUpDown, ChevronDown } from 'lucide-react';
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
}

export function SortSelector({ value, onChange }: SortSelectorProps) {
  const [open, setOpen] = useState(false);

  const currentOption = SORT_OPTIONS.find((opt) => opt.value === value);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className={cn(
          'group relative flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border/60 bg-background px-3 text-sm font-medium transition-all duration-200 cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2',
          open
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />
        <span className={cn(open && 'font-semibold')}>{currentOption?.label}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 opacity-60 transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px] rounded-2xl border border-border/70 bg-popover p-1.5 shadow-[0_18px_30px_-24px_rgba(43,28,18,0.2)]">
        {SORT_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
            className={cn(
              'cursor-pointer rounded-xl px-3 py-2 text-sm transition-colors',
              value === option.value
                ? 'bg-muted/70 font-semibold text-foreground'
                : 'text-muted-foreground hover:bg-muted/55 hover:text-foreground'
            )}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
