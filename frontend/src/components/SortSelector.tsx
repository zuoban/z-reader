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
          'group relative flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl bg-background px-4 text-[13px] font-medium text-foreground shadow-sm cursor-pointer transition-all duration-200',
          'hover:bg-background/95 active:scale-[0.97]',
          open && 'bg-background text-foreground shadow-sm'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <ArrowUpDown className="h-4 w-4 opacity-70 transition-opacity group-hover:opacity-90" />
        <span className="font-medium">{currentOption?.label}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 opacity-60 transition-all duration-200 group-hover:opacity-85',
            open && 'rotate-180 opacity-80'
          )}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[160px] rounded-[1.25rem] border-border bg-background p-1.5 shadow-md"
        style={{
          backgroundColor: 'var(--background)',
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
              'paper-motion-interactive cursor-pointer rounded-[1.15rem] px-3 py-2 text-sm',
              value === option.value
                ? 'bg-muted/50 font-semibold text-foreground'
                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
            )}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
