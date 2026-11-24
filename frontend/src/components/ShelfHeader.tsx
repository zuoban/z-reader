'use client';

import type { ChangeEvent } from 'react';
import { ActionIcon, Menu } from '@mantine/core';
import { HardDrive, LogOut, Moon, MoreHorizontal, Sun, Upload } from 'lucide-react';
import { BrandLogo, LoadingSpinner } from '@/components/AppShell';
import { FileUploadAction } from '@/components/FileUploadAction';

interface ShelfHeaderProps {
  uploadAccept: string;
  isOffline: boolean;
  isUploading: boolean;
  uploadStatusLabel?: string;
  isDark: boolean;
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
  isDark,
  onUpload,
  onToggleTheme,
  onManageOfflineBooks,
  onLogout,
}: ShelfHeaderProps) {
  const ThemeIcon = isDark ? Sun : Moon;

  return (
    <header className="shelf-header sticky top-0 z-50 w-full border-b border-border">
      <div className="app-container flex h-16 items-center justify-between gap-2 sm:gap-3">
        <BrandLogo compact className="shrink-0 whitespace-nowrap" />

        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          {!isOffline && (
            <>
              <FileUploadAction
                accept={uploadAccept}
                onChange={onUpload}
                disabled={isUploading}
                title="上传书籍"
                multiple
                buttonSize="sm"
                buttonClassName="h-11 min-w-11 max-w-full rounded-lg px-2.5 text-[13px] font-medium tabular-nums disabled:bg-secondary disabled:text-secondary-foreground disabled:opacity-100 dark:enabled:text-primary-foreground sm:h-9 sm:px-4 sm:text-sm"
              >
                {isUploading ? (
                  <LoadingSpinner className="hidden size-4 shrink-0 border-secondary-foreground/35 border-t-secondary-foreground sm:block" />
                ) : (
                  <Upload aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
                )}
                <span className="truncate">{uploadStatusLabel ?? '上传'}</span>
              </FileUploadAction>
              <span className="sr-only" role="status" aria-atomic="true">{uploadStatusLabel}</span>
            </>
          )}

          <Menu
            position="bottom-end"
            offset={8}
            width={192}
            withinPortal
            classNames={{ item: 'shelf-settings-item' }}
          >
            <Menu.Target>
              <ActionIcon
                type="button"
                variant="subtle"
                size="md"
                className="size-11 shrink-0 rounded-lg text-foreground hover:bg-secondary data-[expanded]:bg-secondary sm:size-9"
                aria-label="书架设置"
                title="书架设置"
              >
                <MoreHorizontal aria-hidden="true" className="size-5" strokeWidth={1.75} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown className="paper-menu rounded-lg p-1">
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
                  <Menu.Divider role="separator" className="border-border" />
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
