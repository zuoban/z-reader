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
  triggerClassName,
}: BookCardDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="更多操作"
        title="更多操作"
        style={{ minHeight: 'auto', minWidth: 'auto' }}
        className={cn(
          'flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent bg-transparent text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-90',
          triggerClassName
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <MoreVertical className="h-4 w-4 sm:h-5 sm:w-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        alignOffset={4}
        sideOffset={10}
        className="w-[16rem] overflow-hidden rounded-2xl border border-border/40 bg-popover p-1 shadow-lg backdrop-blur-md"
      >
        <div className="px-3 pb-2 pt-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
              书籍详情
            </span>
            <div className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
              {formatLabel}
            </div>
          </div>

          <div className="space-y-2.5 rounded-xl bg-secondary/50 px-3 py-3">
            <DetailRow
              icon={<HardDrive className="h-4 w-4" />}
              label="大小"
              value={sizeLabel || '未知'}
            />
            <DetailRow
              icon={<CalendarClock className="h-4 w-4" />}
              label="上传日期"
              value={uploadedAtLabel}
            />
            <DetailRow
              icon={<Clock className="h-4 w-4" />}
              label="上次阅读"
              value={lastReadLabel}
            />
          </div>
        </div>

        <DropdownMenuSeparator className="mx-2 my-1.5" />

        <div className="p-1">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onCategoryClick();
            }}
            className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-medium transition-colors focus:bg-secondary"
          >
            <Tag className="h-4 w-4 text-muted-foreground" />
            <span>设置分类</span>
            <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/50" />
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDeleteClick();
            }}
            disabled={isDeleting}
            variant="destructive"
            className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-medium transition-colors focus:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
            <span>{isDeleting ? '删除中...' : '删除图书'}</span>
            <ChevronRight className="ml-auto h-4 w-4 opacity-50" />
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
