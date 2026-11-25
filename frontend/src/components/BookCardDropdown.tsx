'use client';

import { useState, type KeyboardEvent } from 'react';
import { ActionIcon, Menu } from '@mantine/core';
import { Loader2, MoreVertical, Pencil, RefreshCw, Tag, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BookCardDropdownProps {
  bookTitle?: string;
  categoryLabel?: string;
  formatLabel: string;
  sizeLabel: string;
  uploadedAtLabel: string;
  isDeleting: boolean;
  isReparsing?: boolean;
  onEditClick: () => void;
  onCategoryClick: () => void;
  onReparseClick: () => void;
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
  isDeleting,
  isReparsing = false,
  onEditClick,
  onCategoryClick,
  onReparseClick,
  onDeleteClick,
  triggerClassName,
}: BookCardDropdownProps) {
  const [menuMounted, setMenuMounted] = useState(false);
  const [opened, setOpened] = useState(false);
  const isBusy = isDeleting || isReparsing;
  const triggerLabel = bookTitle ? `更多操作：《${bookTitle}》` : '更多操作';
  const currentCategoryText = categoryLabel || '未分类';
  const triggerClasses = cn(
    'flex h-10 w-10 min-h-0 min-w-0 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent bg-transparent text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-secondary hover:text-foreground data-[expanded]:bg-secondary data-[expanded]:text-foreground focus-visible:outline-2 focus-visible:outline-ring active:scale-95 motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-45 sm:h-8 sm:w-8',
    triggerClassName
  );
  const triggerIcon = isReparsing ? (
    <Loader2
      className="size-4 animate-spin motion-reduce:animate-none"
      strokeWidth={1.5}
      aria-hidden="true"
    />
  ) : (
    <MoreVertical className="size-4" strokeWidth={1.5} aria-hidden="true" />
  );

  if (!menuMounted) {
    const openLazyMenu = () => {
      if (isBusy) return;
      setMenuMounted(true);
      setOpened(true);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        openLazyMenu();
      }
    };

    return (
      <ActionIcon
        variant="subtle"
        color="gray"
        size="sm"
        radius="md"
        disabled={isBusy}
        aria-busy={isBusy || undefined}
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={false}
        title="更多操作"
        className={triggerClasses}
        onClick={(e) => {
          e.stopPropagation();
          openLazyMenu();
        }}
        onKeyDown={handleKeyDown}
      >
        {triggerIcon}
      </ActionIcon>
    );
  }

  return (
    <Menu
      opened={opened}
      onChange={setOpened}
      position="top-end"
      offset={8}
      width="16rem"
      radius="lg"
      shadow="md"
      zIndex={60}
      withinPortal
    >
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          radius="md"
          disabled={isBusy}
          aria-busy={isBusy || undefined}
          aria-label={triggerLabel}
          title="更多操作"
          className={triggerClasses}
          onClick={(e) => e.stopPropagation()}
        >
          {triggerIcon}
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown
        onClick={(e) => e.stopPropagation()}
        className="paper-menu max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl p-0 font-sans"
      >
        <div className="border-b border-border/70 bg-surface-subtle/75 px-4 py-3">
          <div className="flex items-start justify-between gap-2.5">
            <p
              className="line-clamp-2 min-w-0 wrap-anywhere text-sm font-medium leading-snug text-foreground"
              title={bookTitle || '书籍信息'}
            >
              {bookTitle || '书籍信息'}
            </p>
            <span className="shrink-0 rounded-[4px] border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] font-normal leading-none text-subtle-foreground">
              {formatLabel}
            </span>
          </div>

          <dl
            aria-label="书籍信息"
            className="mt-2.5 space-y-1.5 text-xs leading-4"
          >
            <DetailRow label="大小" value={sizeLabel || '未知'} />
            <DetailRow label="上传日期" value={uploadedAtLabel} />
          </dl>
        </div>

        <div className="p-1.5">
          <Menu.Item
            onClick={(e) => {
              e.stopPropagation();
              onEditClick();
            }}
            disabled={isBusy}
            leftSection={
              <Pencil
                className="h-4 w-4 text-muted-foreground transition-colors"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            }
            className="min-h-11 cursor-pointer rounded-lg px-2.5 py-2 text-sm font-medium text-foreground transition-colors data-[hovered]:bg-secondary data-[hovered]:text-foreground sm:min-h-9 sm:py-1.5"
          >
            <span className="shrink-0">编辑信息</span>
          </Menu.Item>

          <Menu.Item
            onClick={(e) => {
              e.stopPropagation();
              onCategoryClick();
            }}
            disabled={isBusy}
            leftSection={
              <Tag
                className="h-4 w-4 text-muted-foreground transition-colors"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            }
            rightSection={
              <span
                className="max-w-[5.75rem] truncate text-xs font-normal text-muted-foreground"
                title={currentCategoryText}
              >
                {currentCategoryText}
              </span>
            }
            className="min-h-11 cursor-pointer rounded-lg px-2.5 py-2 text-sm font-medium text-foreground transition-colors data-[hovered]:bg-secondary data-[hovered]:text-foreground sm:min-h-9 sm:py-1.5"
          >
            <span className="shrink-0">设置分类</span>
          </Menu.Item>

          <Menu.Item
            onClick={(e) => {
              e.stopPropagation();
              onReparseClick();
            }}
            disabled={isBusy}
            aria-busy={isReparsing || undefined}
            leftSection={
              isReparsing ? (
                <Loader2
                  className="h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              ) : (
                <RefreshCw
                  className="h-4 w-4 text-muted-foreground transition-colors"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              )
            }
            className="min-h-11 cursor-pointer rounded-lg px-2.5 py-2 text-sm font-medium text-foreground transition-colors data-[hovered]:bg-secondary data-[hovered]:text-foreground sm:min-h-9 sm:py-1.5"
          >
            <span className="shrink-0">{isReparsing ? '解析中…' : '重新解析元数据'}</span>
          </Menu.Item>

          <Menu.Divider className="mx-1.5 my-1 border-border/65" />

          <Menu.Item
            color="red"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteClick();
            }}
            disabled={isBusy}
            aria-busy={isDeleting || undefined}
            leftSection={
              isDeleting ? (
                <Loader2
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              ) : (
                <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              )
            }
            className="min-h-11 cursor-pointer rounded-lg px-2.5 py-2 text-sm font-medium text-destructive transition-colors data-[hovered]:bg-destructive/10 dark:data-[hovered]:bg-destructive/18 sm:min-h-9 sm:py-1.5"
          >
            {isDeleting ? '删除中…' : '删除图书'}
          </Menu.Item>
        </div>
      </Menu.Dropdown>
    </Menu>
  );
}
