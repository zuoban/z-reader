'use client';

import { CalendarClock, Clock, HardDrive, MoreVertical, Tag, Trash2 } from 'lucide-react';
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
        sideOffset={10}
        className="w-72 rounded-2xl border border-border/60 bg-background/95 p-3 shadow-xl backdrop-blur-sm"
      >
        <div className="px-2 pb-3 pt-1.5">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-[0.1em] text-foreground/80 uppercase">
              书籍详情
            </span>
            <div className="flex h-5 items-center rounded-full bg-primary/10 px-2 text-[9px] font-bold text-primary">
              {formatLabel}
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2 text-foreground/50">
                <HardDrive className="h-3.5 w-3.5" />
                <span>大小</span>
              </div>
              <span className="font-medium text-foreground/80 tabular-nums">
                {sizeLabel || '未知'}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2 text-foreground/50">
                <CalendarClock className="h-3.5 w-3.5" />
                <span>上传日期</span>
              </div>
              <span className="font-medium text-foreground/80 tabular-nums">
                {uploadedAtLabel}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2 text-foreground/50">
                <Clock className="h-3.5 w-3.5" />
                <span>上次阅读</span>
              </div>
              <span className="font-medium text-foreground/80 tabular-nums">
                {lastReadLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="mx-1 my-1.5 h-px bg-border/40" />

        <div className="space-y-1">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onCategoryClick();
            }}
            className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all hover:bg-primary/8 hover:text-primary focus:bg-primary/8 focus:text-primary"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Tag className="h-4 w-4 text-primary" />
            </div>
            <span>设置分类</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDeleteClick();
            }}
            disabled={isDeleting}
            variant="destructive"
            className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all hover:bg-destructive/8 focus:bg-destructive/8"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10">
              <Trash2 className="h-4 w-4 text-destructive" />
            </div>
            <span>{isDeleting ? '删除中...' : '删除图书'}</span>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
