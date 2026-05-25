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
import { cn } from '@/lib/utils';

interface BookCardDropdownProps {
  formatLabel: string;
  sizeLabel: string;
  uploadedAtLabel: string;
  lastReadLabel: string;
  isDeleting: boolean;
  onCategoryClick: () => void;
  onDeleteClick: () => void;
  triggerClassName?: string;
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
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2.5 text-[12px]">
      <div className="flex min-w-0 items-center gap-2 text-muted-foreground/75">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground/60">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      <span className="truncate text-right font-medium tabular-nums text-foreground/80">
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
  triggerClassName,
}: BookCardDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="更多操作"
        title="更多操作"
        className={cn(
          'flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-transparent bg-transparent text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-90 sm:h-10 sm:w-10',
          triggerClassName
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <MoreVertical className="h-4 w-4 sm:h-5 sm:w-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        alignOffset={0}
        sideOffset={10}
        className="w-[16.5rem] overflow-hidden rounded-[20px] border border-border/55 bg-popover/95 p-1.5 shadow-[0_12px_38px_rgba(0,0,0,0.08)] backdrop-blur-xl [font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,sans-serif]"
      >
        <div className="px-3.5 pb-2.5 pt-3.5">
          <div className="mb-3.5 flex items-center justify-between gap-3">
            <span className="text-[11px] font-bold tracking-wider text-muted-foreground/80 uppercase">
              书籍详情
            </span>
            <div className="rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold text-primary-foreground">
              {formatLabel}
            </div>
          </div>

          <div className="space-y-3 rounded-2xl bg-[#f6f6f6] dark:bg-zinc-900/60 border border-border/10 px-3.5 py-3.5">
            <DetailRow
              icon={<HardDrive className="h-4 w-4 stroke-[1.8]" />}
              label="大小"
              value={sizeLabel || '未知'}
            />
            <DetailRow
              icon={<CalendarClock className="h-4 w-4 stroke-[1.8]" />}
              label="上传日期"
              value={uploadedAtLabel}
            />
            <DetailRow
              icon={<Clock className="h-4 w-4 stroke-[1.8]" />}
              label="上次阅读"
              value={lastReadLabel}
            />
          </div>
        </div>

        <DropdownMenuSeparator className="mx-2.5 my-1.5 bg-border/50" />

        <div className="p-1">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onCategoryClick();
            }}
            className="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors focus:bg-secondary/80 focus:text-foreground"
          >
            <Tag className="h-4 w-4 text-muted-foreground/75 stroke-[1.8]" />
            <span>设置分类</span>
            <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground/40 stroke-[1.8]" />
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDeleteClick();
            }}
            disabled={isDeleting}
            variant="destructive"
            className="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors"
          >
            <Trash2 className="h-4 w-4 stroke-[1.8]" />
            <span>{isDeleting ? '删除中...' : '删除图书'}</span>
            <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-40 stroke-[1.8]" />
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
