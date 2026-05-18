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
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3 text-[11px]">
      <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground/78">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      <span className="truncate text-right font-semibold tabular-nums text-foreground/90">
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
        title="更多操作"
        className="absolute right-[-8px] top-[-7px] flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent bg-transparent text-muted-foreground/62 outline-none transition-[background-color,border-color,color,transform,opacity] duration-200 hover:border-border/70 hover:bg-muted/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25 active:scale-95 sm:opacity-0 sm:group-hover/card:opacity-100 sm:group-focus-within/card:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        alignOffset={4}
        sideOffset={10}
        className="w-[15.5rem] rounded-2xl border border-border/65 bg-popover/98 p-1.5 text-popover-foreground shadow-[0_20px_54px_-34px_var(--paper-shadow),0_8px_24px_-22px_var(--paper-shadow-soft)] ring-1 ring-white/50 backdrop-blur-md dark:ring-white/10"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--popover) 96%, var(--background)) 0%, var(--popover) 100%)',
        }}
      >
        <div className="px-2.5 pb-2 pt-2.5">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <span className="text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
              书籍详情
            </span>
            <div className="flex h-6 items-center rounded-full border border-primary/15 bg-primary/8 px-2.5 text-[10px] font-bold tracking-[0.08em] text-primary">
              {formatLabel}
            </div>
          </div>

          <div className="space-y-2 rounded-xl bg-muted/38 px-2.5 py-2.5">
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

        <DropdownMenuSeparator className="mx-2 my-1.5 bg-border/65" />

        <div className="space-y-0.5 px-1">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onCategoryClick();
            }}
            className="group flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted/68 hover:text-primary focus:bg-muted/68 focus:text-primary"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
              <Tag className="h-3.5 w-3.5" />
            </div>
            <span>设置分类</span>
            <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground/45 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDeleteClick();
            }}
            disabled={isDeleting}
            variant="destructive"
            className="group flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-[13px] font-semibold transition-colors hover:bg-destructive/10 focus:bg-destructive/10"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </div>
            <span>{isDeleting ? '删除中...' : '删除图书'}</span>
            <ChevronRight className="ml-auto h-3.5 w-3.5 text-destructive/45 transition-transform group-hover:translate-x-0.5" />
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
