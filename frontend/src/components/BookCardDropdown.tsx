'use client';

import { MoreVertical, Tag, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface BookCardDropdownProps {
  bookTitle?: string;
  categoryLabel?: string;
  formatLabel: string;
  sizeLabel: string;
  uploadedAtLabel: string;
  lastReadLabel: string;
  isDeleting: boolean;
  onCategoryClick: () => void;
  onDeleteClick: () => void;
  triggerClassName?: string;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium tabular-nums text-foreground/85">
        {value}
      </dd>
    </div>
  );
}

export function BookCardDropdown({
  bookTitle,
  categoryLabel,
  formatLabel,
  sizeLabel,
  uploadedAtLabel,
  lastReadLabel,
  isDeleting,
  onCategoryClick,
  onDeleteClick,
  triggerClassName,
}: BookCardDropdownProps) {
  const triggerLabel = bookTitle ? `更多操作：《${bookTitle}》` : '更多操作';
  const currentCategoryText = categoryLabel || '未分类';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={triggerLabel}
        title="更多操作"
        className={cn(
          'flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent bg-transparent text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-secondary hover:text-foreground data-[popup-open]:bg-secondary data-[popup-open]:text-foreground focus-visible:outline-2 focus-visible:outline-ring active:scale-95 sm:h-8 sm:w-8',
          triggerClassName
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="end"
        alignOffset={10}
        sideOffset={8}
        collisionPadding={12}
        className="w-[14.5rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-border bg-popover p-0 font-sans shadow-[var(--paper-shadow-floating)]"
      >
        <div className="border-b border-border/70 bg-surface-subtle/75 px-4 py-3">
          <div className="flex items-center justify-between gap-2.5">
            <p
              className="min-w-0 truncate font-heading text-[13px] font-semibold leading-snug text-foreground"
              title={bookTitle || '书籍信息'}
            >
              {bookTitle || '书籍信息'}
            </p>
            <span className="shrink-0 rounded-[4px] border border-border/80 bg-card px-1.5 py-[1px] font-mono text-[10px] font-medium leading-[1.4] tracking-[0.04em] text-subtle-foreground">
              {formatLabel}
            </span>
          </div>

          <dl
            aria-label="书籍信息"
            className="mt-2.5 space-y-1.5 text-[12px] leading-4"
          >
            <DetailRow label="大小" value={sizeLabel || '未知'} />
            <DetailRow label="上传日期" value={uploadedAtLabel} />
            <DetailRow label="上次阅读" value={lastReadLabel} />
          </dl>
        </div>

        <div className="p-1.5">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onCategoryClick();
            }}
            className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-foreground transition-colors focus:bg-secondary focus:text-foreground data-[highlighted]:bg-secondary data-[highlighted]:text-foreground sm:min-h-9 sm:py-1.5"
          >
            <Tag
              className="h-4 w-4 text-muted-foreground transition-colors group-focus/dropdown-menu-item:text-foreground group-data-[highlighted]/dropdown-menu-item:text-foreground"
              strokeWidth={1.6}
            />
            <span className="shrink-0">设置分类</span>
            <span
              className="ml-auto max-w-[5.75rem] truncate text-xs font-normal text-muted-foreground"
              title={currentCategoryText}
            >
              {currentCategoryText}
            </span>
          </DropdownMenuItem>

          <DropdownMenuSeparator className="mx-1.5 my-1 bg-border/65" />

          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDeleteClick();
            }}
            disabled={isDeleting}
            variant="destructive"
            className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors data-[highlighted]:bg-destructive/10 dark:data-[highlighted]:bg-destructive/18 sm:min-h-9 sm:py-1.5"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.6} />
            <span>{isDeleting ? '删除中…' : '删除图书'}</span>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
