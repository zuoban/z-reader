'use client';

import type { ReactNode } from 'react';
import {
  CalendarClock,
  ChevronRight,
  Clock,
  HardDrive,
  MoreVertical,
  Tag,
  Trash2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface BookCardDropdownProps {
  formatLabel: string;
  sizeLabel: string;
  uploadedAtLabel: string;
  lastReadLabel: string;
  isDeleting: boolean;
  onCategoryClick: () => void;
  onDeleteClick: () => void;
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(4.5rem,1fr)_auto] items-center gap-3 text-[11px]">
      <div className="flex min-w-0 items-center gap-2 text-foreground/58">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary/72">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      <span className="max-w-[9.5rem] truncate text-right font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

export function BookCardDropdown({
  formatLabel,
  sizeLabel,
  uploadedAtLabel,
  lastReadLabel,
  isDeleting,
  onCategoryClick,
  onDeleteClick,
}: BookCardDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="更多操作"
        className="absolute right-[-14px] top-[-4px] flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[0.95rem] border-0 bg-transparent text-foreground/46 shadow-none outline-none transition-[color,transform,opacity] duration-200 hover:text-foreground/82 focus-visible:ring-2 focus-visible:ring-primary/25 active:scale-95 sm:right-[-16px] sm:h-[30px] sm:w-[30px] sm:rounded-[0.9rem] sm:opacity-0 sm:group-hover/card:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <MoreVertical className="h-3.5 w-3.5 sm:h-3 sm:w-3 sm:opacity-90" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        alignOffset={-4}
        sideOffset={12}
        className="w-[17rem] rounded-[1.25rem] border border-primary/12 bg-[var(--shelf-surface-raised)] p-2.5 shadow-[0_24px_60px_-34px_var(--paper-shadow),0_10px_28px_-24px_var(--paper-shadow-soft),inset_0_1px_0_color-mix(in_srgb,var(--paper-edge)_78%,transparent)] ring-1 ring-primary/8"
        style={{ backgroundColor: 'var(--shelf-surface-raised)' }}
      >
        <div className="rounded-[1rem] border border-primary/10 bg-[var(--shelf-surface-soft)] px-3 py-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[10px] font-bold tracking-[0.16em] text-foreground/78 uppercase">
              书籍详情
            </span>
            <div className="flex h-6 items-center rounded-full border border-primary/16 bg-primary/12 px-2.5 text-[10px] font-bold tracking-[0.08em] text-primary">
              {formatLabel}
            </div>
          </div>

          <div className="space-y-2">
            <DetailRow
              icon={<HardDrive className="h-3.5 w-3.5" />}
              label="大小"
              value={sizeLabel || '未知'}
            />
            <DetailRow
              icon={<CalendarClock className="h-3.5 w-3.5" />}
              label="上传日期"
              value={uploadedAtLabel}
            />
            <DetailRow
              icon={<Clock className="h-3.5 w-3.5" />}
              label="上次阅读"
              value={lastReadLabel}
            />
          </div>
        </div>

        <DropdownMenuSeparator className="my-2 bg-primary/10" />

        <div className="space-y-1">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onCategoryClick();
            }}
            className="group flex cursor-pointer items-center gap-3 rounded-[1rem] px-2.5 py-2.5 text-[13px] font-semibold text-foreground transition-all hover:bg-[var(--shelf-surface-hover)] hover:text-primary focus:bg-[var(--shelf-surface-hover)] focus:text-primary"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 transition-transform group-hover:scale-105 group-focus:scale-105">
              <Tag className="h-4 w-4 text-primary" />
            </div>
            <span>设置分类</span>
            <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/45 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDeleteClick();
            }}
            disabled={isDeleting}
            variant="destructive"
            className="group flex cursor-pointer items-center gap-3 rounded-[1rem] px-2.5 py-2.5 text-[13px] font-semibold transition-all hover:bg-destructive/10 focus:bg-destructive/10"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-destructive/10 transition-transform group-hover:scale-105 group-focus:scale-105">
              <Trash2 className="h-4 w-4 text-destructive" />
            </div>
            <span>{isDeleting ? '删除中...' : '删除图书'}</span>
            <ChevronRight className="ml-auto h-4 w-4 text-destructive/45 transition-transform group-hover:translate-x-0.5" />
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
