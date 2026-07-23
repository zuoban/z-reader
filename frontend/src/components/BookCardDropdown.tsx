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
          'flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-transparent bg-transparent text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-90 sm:h-10 sm:w-10',
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
        className="app-dialog-shell paper-texture w-[16.5rem] overflow-hidden rounded-2xl border p-1.5 font-sans backdrop-blur-xl"
      >
        <div className="px-3 pb-2.5 pt-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              书籍详情
            </span>
            <div className="rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold tabular-nums text-primary-foreground">
              {formatLabel}
            </div>
          </div>

          <div className="app-surface-panel space-y-3 rounded-xl px-3.5 py-3">
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

        <DropdownMenuSeparator className="mx-2.5 my-1.5 bg-border/55" />

        <div className="p-1">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onCategoryClick();
            }}
            className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors focus:bg-secondary/80 focus:text-foreground"
          >
            <Tag className="h-4 w-4 stroke-[1.8] text-muted-foreground" />
            <span>设置分类</span>
            <ChevronRight className="ml-auto h-3.5 w-3.5 stroke-[1.8] text-muted-foreground/55" />
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDeleteClick();
            }}
            disabled={isDeleting}
            variant="destructive"
            className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors"
          >
            <Trash2 className="h-4 w-4 stroke-[1.8]" />
            <span>{isDeleting ? '删除中...' : '删除图书'}</span>
            <ChevronRight className="ml-auto h-3.5 w-3.5 stroke-[1.8] opacity-45" />
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
