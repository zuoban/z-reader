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
          'group relative flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm font-medium cursor-pointer transition-colors duration-200',
          'text-muted-foreground hover:text-foreground hover:bg-muted/40',
          open && 'text-foreground bg-muted/50'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />
        <span className={cn(open && 'font-semibold')}>{currentOption?.label}</span>
        <ChevronDown
          className={cn(
            'paper-motion-interactive h-3.5 w-3.5 opacity-60',
            open && 'rotate-180'
          )}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px] rounded-xl p-1.5">
        {SORT_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
            className={cn(
              'paper-motion-interactive cursor-pointer rounded-xl px-3 py-2 text-sm',
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
