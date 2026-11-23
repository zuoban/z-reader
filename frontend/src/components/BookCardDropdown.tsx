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
          'flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-transparent text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 sm:h-9 sm:w-9',
          triggerClassName
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        alignOffset={0}
        sideOffset={8}
        className="app-dialog-shell w-64 overflow-hidden rounded-xl border p-1.5 font-sans"
      >
        <div className="px-2.5 pb-2 pt-2">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-muted-foreground">
              书籍信息
            </span>
            <div className="rounded-md bg-secondary px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-foreground">
              {formatLabel}
            </div>
          </div>

          <div className="app-surface-panel space-y-2.5 rounded-lg px-3 py-2.5">
            <DetailRow
              icon={<HardDrive className="h-3.5 w-3.5" strokeWidth={1.5} />}
              label="大小"
              value={sizeLabel || '未知'}
            />
            <DetailRow
              icon={<CalendarClock className="h-3.5 w-3.5" strokeWidth={1.5} />}
              label="上传日期"
              value={uploadedAtLabel}
            />
            <DetailRow
              icon={<Clock className="h-3.5 w-3.5" strokeWidth={1.5} />}
              label="上次阅读"
              value={lastReadLabel}
            />
          </div>
        </div>

        <DropdownMenuSeparator className="mx-2 my-1 bg-border/60" />

        <div className="p-0.5">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onCategoryClick();
            }}
            className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors focus:bg-secondary focus:text-foreground"
          >
            <Tag className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <span>设置分类</span>
            <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground/60" />
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDeleteClick();
            }}
            disabled={isDeleting}
            variant="destructive"
            className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
            <span>{isDeleting ? '删除中...' : '删除图书'}</span>
            <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-50" />
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
