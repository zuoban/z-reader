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
      zIndex={60}
      withinPortal
    >
      <Menu.Target>
        <Button
          type="button"
          variant="default"
          fullWidth
          aria-label="书籍排序方式"
          aria-expanded={open}
          title={currentOption ? `排序：${currentOption.label}` : '书籍排序方式'}
          className={cn(
            'app-field group min-h-0 w-full cursor-pointer px-0 text-sm font-medium text-foreground transition-colors hover:bg-secondary data-[expanded]:border-primary/40 data-[expanded]:bg-secondary/80 sm:pl-3 sm:pr-2.5 sm:text-[13px]',
            className
          )}
          classNames={{
            inner: 'w-full',
            label: 'flex w-full items-center justify-center gap-1.5 sm:justify-between',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <ArrowDownWideNarrow
            className="h-4.5 w-4.5 sm:hidden"
            strokeWidth={1.6}
            aria-hidden="true"
          />
          <span className="hidden min-w-0 truncate text-foreground sm:block">
            {currentOption?.label}
          </span>
          <ChevronDown
            className={cn(
              'hidden h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 sm:block',
              open && 'rotate-180 text-foreground'
            )}
            strokeWidth={1.6}
            aria-hidden="true"
          />
        </Button>
      </Menu.Target>
      <Menu.Dropdown className="paper-menu min-w-[11rem] rounded-xl p-1.5">
        <Menu.Label className="px-2.5 pb-1.5 pt-1 text-[11px] font-medium tracking-wide text-muted-foreground">
          排序方式
        </Menu.Label>
        {SORT_OPTIONS.map((option) => {
          const isSelected = value === option.value;
          return (
            <Menu.Item
              key={option.value}
              data-active={isSelected}
              aria-current={isSelected ? 'true' : undefined}
              onClick={() => {
                if (!isSelected) {
                  onChange(option.value);
                }
                setOpen(false);
              }}
              rightSection={
                isSelected ? (
                  <Check
                    className="h-3.5 w-3.5 text-primary"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                ) : null
              }
              className={cn(
                'min-h-10 cursor-pointer rounded-lg px-2.5 py-2 text-sm transition-colors sm:min-h-9 sm:py-1.5',
                isSelected
                  ? 'bg-primary/[0.08] font-medium text-primary data-[hovered]:bg-primary/[0.12]'
                  : 'text-foreground/85 data-[hovered]:bg-secondary data-[hovered]:text-foreground'
              )}
            >
              <span className="block min-w-0 truncate">{option.label}</span>
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}
