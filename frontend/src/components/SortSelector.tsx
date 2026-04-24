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
}

export function SortSelector({ value, onChange }: SortSelectorProps) {
  const [open, setOpen] = useState(false);

  const currentOption = SORT_OPTIONS.find((opt) => opt.value === value);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className={cn(
          'group relative grid h-11 w-[13.75rem] max-w-full cursor-pointer grid-cols-[1.25rem_1fr_1.25rem] items-center gap-2 whitespace-nowrap rounded-full border border-border/45 bg-background/70 px-4 text-[13px] font-semibold text-foreground shadow-[0_10px_24px_-20px_var(--paper-shadow)] transition-all duration-200',
          'hover:border-border/60 hover:bg-background/85 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary/15',
          open && 'border-border/60 bg-background/85 text-foreground'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <ArrowUpDown className="h-4 w-4 opacity-65 transition-opacity group-hover:opacity-85" />
        <span className="min-w-0 truncate text-center font-medium">{currentOption?.label}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 justify-self-end opacity-55 transition-all duration-200 group-hover:opacity-80',
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
              'paper-motion-interactive cursor-pointer rounded-[1.15rem] px-3 py-2 pr-8 text-sm focus:bg-muted/50 focus:text-foreground',
              value === option.value
                ? 'bg-muted/50 font-semibold text-foreground'
                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
            )}
          >
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {value === option.value && (
              <Check className="absolute right-2 h-4 w-4 text-foreground" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
