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
          'group relative grid h-11 w-full sm:w-[13.75rem] max-w-full cursor-pointer grid-cols-[1.25rem_1fr_1.25rem] items-center gap-2 whitespace-nowrap rounded-full border border-primary/14 bg-[var(--shelf-surface-raised)] px-4 text-[13px] font-semibold text-foreground shadow-[0_10px_24px_-20px_var(--paper-shadow),inset_0_1px_0_color-mix(in_srgb,var(--paper-edge)_80%,transparent)] transition-all duration-200',
          'hover:border-primary/24 hover:bg-[var(--shelf-surface-raised)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary/15',
          open && 'border-primary/24 bg-[var(--shelf-surface-raised)] text-foreground'
        )}
        style={{ backgroundColor: 'var(--shelf-surface-raised)' }}
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
        className="min-w-[160px] rounded-[1.25rem] border border-primary/12 bg-[var(--shelf-surface-raised)] p-1.5 shadow-[0_22px_54px_-34px_var(--paper-shadow),0_8px_24px_-22px_var(--paper-shadow-soft),inset_0_1px_0_color-mix(in_srgb,var(--paper-edge)_78%,transparent)] ring-1 ring-primary/8"
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
              'paper-motion-interactive cursor-pointer rounded-[1.15rem] px-3 py-2 pr-8 text-sm focus:bg-[var(--shelf-surface-selected)] focus:text-foreground',
              value === option.value
                ? 'bg-[var(--shelf-surface-selected)] font-semibold text-foreground'
                : 'text-foreground/62 hover:bg-[var(--shelf-surface-hover)] hover:text-foreground'
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
