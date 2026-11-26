'use client';

import type { ChangeEvent } from 'react';
import { Button } from '@mantine/core';
import { AlertCircle, BookOpen, HardDrive, Loader2, WifiOff } from 'lucide-react';
import { AppScreen, LoadingSpinner } from '@/components/AppShell';
import { EmptyState } from '@/components/EmptyState';
import { FileUploadAction } from '@/components/FileUploadAction';
import { SUPPORTED_FORMATS_ACCEPT, SUPPORTED_FORMAT_LABELS } from './constants';

export function ShelfAuthLoadingView() {
  return (
    <AppScreen>
      <div
        className="flex min-h-dvh items-center justify-center"
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="正在加载书库"
      >
        <div className="flex flex-col items-center gap-4">
          <LoadingSpinner className="h-9 w-9 border-primary/20" />
          <p className="text-xs font-medium text-muted-foreground">正在加载书库</p>
        </div>
      </div>
    </AppScreen>
  );
}

export interface ShelfOfflineStateProps {
  isRetryingAuth: boolean;
  onRetryConnection: () => void | Promise<void>;
  onOpenOfflineBooks: () => void;
}

export function ShelfOfflineState({
  isRetryingAuth,
  onRetryConnection,
  onOpenOfflineBooks,
}: ShelfOfflineStateProps) {
  return (
    <div>
      <EmptyState
        icon={WifiOff}
        title="当前处于离线状态"
        description="暂时无法连接服务器。你仍可阅读已保存到此设备的离线图书。"
        action={
          <>
            <Button
              type="button"
              variant="filled"
              className="min-h-11 cursor-pointer rounded-lg"
              disabled={isRetryingAuth}
              aria-busy={isRetryingAuth || undefined}
              leftSection={
                isRetryingAuth ? (
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                ) : undefined
              }
              onClick={() => void onRetryConnection()}
            >
              {isRetryingAuth ? '连接中…' : '重试连接'}
            </Button>
            <Button
              type="button"
              variant="default"
              leftSection={<HardDrive className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />}
              className="min-h-11 cursor-pointer rounded-lg"
              onClick={onOpenOfflineBooks}
            >
              打开离线图书
            </Button>
          </>
        }
      />
    </div>
  );
}

export interface ShelfLoadErrorStateProps {
  loadError: string;
  onRetry: () => void;
}

export function ShelfLoadErrorState({ loadError, onRetry }: ShelfLoadErrorStateProps) {
  return (
    <div>
      <EmptyState
        icon={AlertCircle}
        tone="error"
        title="书架暂时无法加载"
        description="请确认服务器可用后重新加载。"
        detail={`错误信息：${loadError}`}
        action={
          <Button
            type="button"
            variant="filled"
            className="min-h-11 cursor-pointer rounded-lg"
            onClick={onRetry}
          >
            重新加载
          </Button>
        }
      />
    </div>
  );
}

export interface ShelfEmptyLibraryStateProps {
  isUploading: boolean;
  uploadStatusLabel?: string;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function ShelfEmptyLibraryState({
  isUploading,
  uploadStatusLabel,
  onUpload,
}: ShelfEmptyLibraryStateProps) {
  return (
    <div className="relative">
      <EmptyState
        icon={BookOpen}
        title="书架还是空的"
        description="上传 EPUB、MOBI、AZW3 或 PDF 开始阅读。"
        detail={
          <div className="flex flex-col items-center gap-2.5">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {SUPPORTED_FORMAT_LABELS.map((format) => (
                <span key={format} className="shelf-format-pill">
                  {format}
                </span>
              ))}
            </div>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              也可以将文件拖放到书库批量导入。
            </span>
          </div>
        }
        action={
          <FileUploadAction
            accept={SUPPORTED_FORMATS_ACCEPT}
            onChange={onUpload}
            disabled={isUploading}
            title="上传书籍"
            label="添加第一本书"
            statusLabel={uploadStatusLabel}
            density="prominent"
            multiple
            wrapperClassName="w-full sm:w-auto"
            buttonClassName="w-full sm:w-auto"
          />
        }
      />
    </div>
  );
}
