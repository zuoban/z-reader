'use client';

import type { ChangeEvent } from 'react';
import { ActionIcon, Menu } from '@mantine/core';
import { BookOpen, HardDrive, LogOut, Moon, MoreHorizontal, Sun, WifiOff } from 'lucide-react';
import { BrandLogo } from '@/components/AppShell';
import { FileUploadAction } from '@/components/FileUploadAction';

export interface ShelfResumeBook {
  id: string;
  title: string;
  progress: number;
}

interface ShelfHeaderProps {
  uploadAccept: string;
  isOffline: boolean;
  isUploading: boolean;
  uploadStatusLabel?: string;
  isQuietUpload?: boolean;
  isDark: boolean;
  resumeBook?: ShelfResumeBook | null;
  onResumeBook?: (bookId: string) => void;
  onPrefetchResumeBook?: (bookId: string) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onToggleTheme: () => void;
  onManageOfflineBooks: () => void;
  onLogout?: () => void;
}

export function ShelfHeader({
  uploadAccept,
  isOffline,
  isUploading,
  uploadStatusLabel,
  isQuietUpload = false,
  isDark,
  resumeBook = null,
  onResumeBook,
  onPrefetchResumeBook,
  onUpload,
  onToggleTheme,
  onManageOfflineBooks,
  onLogout,
}: ShelfHeaderProps) {
  const ThemeIcon = isDark ? Sun : Moon;

  return (
    <header className="shelf-header sticky top-0 z-50 w-full border-b border-border pt-[env(safe-area-inset-top,0px)]">
      <div className="app-container flex h-14 items-center justify-between gap-2 sm:gap-3">
        <BrandLogo compact className="shrink-0 whitespace-nowrap" />

        {!isOffline && resumeBook && onResumeBook && (
          <button
            type="button"
            onClick={() => onResumeBook(resumeBook.id)}
            onPointerEnter={() => onPrefetchResumeBook?.(resumeBook.id)}
            onFocus={() => onPrefetchResumeBook?.(resumeBook.id)}
            aria-label={`续读：${resumeBook.title}（${resumeBook.progress}%）`}
            title={`续读：${resumeBook.title}（${resumeBook.progress}%）`}
            className="shelf-resume-pill group hidden min-w-0 max-w-[18rem] cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-xs md:inline-flex lg:max-w-[24rem]"
          >
            <BookOpen
              aria-hidden="true"
              className="size-3.5 shrink-0 text-primary"
              strokeWidth={1.75}
            />
            <span className="shrink-0 font-medium text-muted-foreground">续读</span>
            <span className="min-w-0 flex-1 truncate font-medium text-foreground transition-colors group-hover:text-primary">
              {resumeBook.title}
            </span>
            <span className="shrink-0 rounded-full bg-primary/12 px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums text-primary">
              {resumeBook.progress}%
            </span>
          </button>
        )}

        <div className="flex min-w-0 items-center gap-2">
          {isOffline ? (
            <span
              role="status"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-secondary px-3 text-xs font-medium text-muted-foreground"
            >
              <WifiOff aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.6} />
              <span>离线模式</span>
            </span>
          ) : (
            <>
              <FileUploadAction
                accept={uploadAccept}
                onChange={onUpload}
                disabled={isUploading}
                title="上传书籍"
                label="上传"
                statusLabel={uploadStatusLabel}
                density="header"
                emphasis={isQuietUpload ? 'secondary' : 'primary'}
                multiple
              />
              <span className="sr-only" role="status" aria-atomic="true">{uploadStatusLabel}</span>
            </>
          )}

          <ActionIcon
            type="button"
            variant="subtle"
            size="md"
            onClick={onToggleTheme}
            className="size-11 shrink-0 cursor-pointer rounded-lg text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring active:scale-95 motion-reduce:active:scale-100 sm:size-9"
            aria-label="切换明暗外观"
            title={isDark ? '切换为亮色模式' : '切换为暗色模式'}
          >
            <ThemeIcon aria-hidden="true" className="size-[18px]" strokeWidth={1.5} />
          </ActionIcon>

          <Menu
            position="bottom-end"
            offset={8}
            width={200}
            radius="lg"
            shadow="md"
            zIndex={60}
            withinPortal
            classNames={{ item: 'shelf-settings-item' }}
          >
            <Menu.Target>
              <ActionIcon
                type="button"
                variant="subtle"
                size="md"
                className="size-11 shrink-0 cursor-pointer rounded-lg text-foreground transition-[background-color,color,transform] duration-150 hover:bg-secondary data-[expanded]:bg-secondary focus-visible:outline-2 focus-visible:outline-ring active:scale-95 motion-reduce:active:scale-100 sm:size-9"
                aria-label="书架设置"
                title="书架设置"
              >
                <MoreHorizontal aria-hidden="true" className="size-[18px]" strokeWidth={1.5} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown className="paper-menu max-w-[calc(100vw-1.5rem)] rounded-xl p-1.5">
              <Menu.Label className="px-2.5 pb-1.5 pt-1 text-xs font-normal text-muted-foreground">
                书架设置
              </Menu.Label>
              <Menu.Item
                leftSection={<HardDrive aria-hidden="true" strokeWidth={1.5} />}
                onClick={onManageOfflineBooks}
              >
                离线图书管理
              </Menu.Item>
              <Menu.Item
                leftSection={<ThemeIcon aria-hidden="true" strokeWidth={1.5} />}
                onClick={onToggleTheme}
              >
                {isDark ? '亮色模式' : '暗色模式'}
              </Menu.Item>
              {onLogout && (
                <>
                  <Menu.Divider role="separator" className="mx-1.5 my-1 border-border/70" />
                  <Menu.Item
                    className="shelf-settings-item-danger"
                    leftSection={<LogOut aria-hidden="true" strokeWidth={1.5} />}
                    onClick={onLogout}
                  >
                    退出登录
                  </Menu.Item>
                </>
              )}
            </Menu.Dropdown>
          </Menu>
        </div>
      </div>
    </header>
  );
}
