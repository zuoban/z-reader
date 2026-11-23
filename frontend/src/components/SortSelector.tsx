'use client';

import { Button, Menu } from '@mantine/core';
import { ArrowDownWideNarrow, Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';
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
    <Menu
      opened={open}
      onChange={setOpen}
      position="bottom-end"
      offset={6}
      radius="lg"
      shadow="md"
    >
      <Menu.Target>
        <Button
          type="button"
          variant="default"
          fullWidth
          aria-label="书籍排序方式"
          title={`排序：${currentOption?.label}`}
          className={cn(
            'app-field group min-h-0 w-full px-0 text-sm font-medium text-foreground hover:bg-secondary sm:pl-3 sm:pr-2.5 sm:text-[13px]',
            className
          )}
          classNames={{
            inner: 'w-full',
            label: 'flex w-full items-center justify-center gap-1.5 sm:justify-between',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <ArrowDownWideNarrow className="h-4.5 w-4.5 sm:hidden" strokeWidth={1.5} aria-hidden="true" />
          <span className="hidden min-w-0 truncate text-foreground sm:block">
            {currentOption?.label}
          </span>
          <ChevronDown
            className={cn(
              'hidden h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 sm:block',
              open && 'rotate-180'
            )}
            strokeWidth={1.5}
          />
        </Button>
      </Menu.Target>
      <Menu.Dropdown className="paper-menu min-w-[10rem] rounded-xl p-1.5">
        {SORT_OPTIONS.map((option) => (
          <Menu.Item
            key={option.value}
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
            rightSection={
              value === option.value ? (
                <Check className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
              ) : null
            }
            className={cn(
              'min-h-10 rounded-lg px-3 py-2 text-sm transition-colors',
              value === option.value
                ? 'bg-secondary font-medium text-foreground data-[hovered]:bg-secondary'
                : 'text-foreground/80 data-[hovered]:bg-secondary data-[hovered]:text-foreground'
            )}
          >
            <span className="block min-w-0 truncate">{option.label}</span>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
