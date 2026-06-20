"use client";

import { type ReactNode, type RefObject, useState } from "react";
import {
  ArrowLeft,
  Bookmark as BookmarkIcon,
  BookmarkPlus,
  List,
  Maximize,
  Minimize,
  MoreHorizontal,
  Settings,
} from "lucide-react";

import { ThemeSettings } from "@/components/ThemeSettings";
import { Button } from "@/components/ui/button";
import { ReaderBookmarksSheet } from "@/components/reader/ReaderBookmarksSheet";
import { ReaderTOCSheet } from "@/components/reader/ReaderTOCSheet";
import type { ReaderTheme, ThemeColors } from "@/hooks/useReaderTheme";
import type { Bookmark } from "@/lib/api";
import type { TOCItem } from "@/lib/types";
import { withOpacity } from "@/lib/reader-ui";

interface ReaderToolbarProps {
  visible: boolean;
  bookTitle: string;
  bookAuthor: string;
  toc: TOCItem[];
  tocOpen: boolean;
  onTocOpenChange: (open: boolean) => void;
  bookmarksOpen: boolean;
  onBookmarksOpenChange: (open: boolean) => void;
  bookmarks: Bookmark[];
  canCreateBookmark: boolean;
  isSavingBookmark: boolean;
  onCreateBookmark: () => void;
  onGoToBookmark: (bookmark: Bookmark) => void;
  onDeleteBookmark: (bookmarkId: string) => void;
  ttsControls?: ReactNode;
  mobileTtsControls?: ReactNode;
  tocListRef: RefObject<HTMLDivElement | null>;
  currentChapter: string;
  currentChapterHref: string;
  onLocateCurrentChapter: () => void;
  onGoTo: (href: string) => void;
  onBack: () => void;
  uiScheme: ThemeColors;
  headerSafeAreaPaddingTop: string;
  overlayContainer?: HTMLElement | null;
  theme: ReaderTheme;
  setTheme: (theme: Partial<ReaderTheme>) => void;
  themeSettingsOpen: boolean;
  onThemeSettingsOpenChange: (open: boolean) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export function ReaderToolbar({
  visible,
  bookTitle,
  bookAuthor,
  toc,
  tocOpen,
  onTocOpenChange,
  bookmarksOpen,
  onBookmarksOpenChange,
  bookmarks,
  canCreateBookmark,
  isSavingBookmark,
  onCreateBookmark,
  onGoToBookmark,
  onDeleteBookmark,
  ttsControls,
  mobileTtsControls,
  tocListRef,
  currentChapter,
  currentChapterHref,
  onLocateCurrentChapter,
  onGoTo,
  onBack,
  uiScheme,
  headerSafeAreaPaddingTop,
  overlayContainer,
  theme,
  setTheme,
  themeSettingsOpen,
  onThemeSettingsOpenChange,
  isFullscreen,
  onToggleFullscreen,
}: ReaderToolbarProps) {
  const isDark = theme.preset === "dark";
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);

  function closeMobileActions() {
    setMobileActionsOpen(false);
  }

  return (
    <>
      <header
        data-reader-interactive="true"
        className={`reader-chrome pointer-events-none absolute inset-x-0 top-0 z-50 transition-all duration-300 ease-out ${
          visible
            ? "translate-y-0 opacity-100"
            : "-translate-y-[calc(100%+env(safe-area-inset-top,0px))] opacity-0"
        }`}
        style={{
          background: uiScheme.bg,
          borderBottom: `1px solid ${withOpacity(uiScheme.cardBorder, isDark ? 0.15 : 0.08)}`,
          paddingTop: headerSafeAreaPaddingTop,
        }}
      >
        <div className="pointer-events-auto mx-auto flex h-12 max-w-full items-center px-4 sm:px-6">
          <div className="flex flex-1 items-center gap-2 overflow-hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              title="返回书库"
              className="h-10 w-10 shrink-0 rounded-xl text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0 overflow-hidden">
              <h1
                className="truncate text-base font-bold tracking-tight sm:text-lg"
                style={{ color: uiScheme.fg }}
              >
                {bookTitle || "阅读中"}
              </h1>
            </div>
          </div>

          <div className="relative flex items-center gap-1 sm:gap-4">
            <div className="sm:hidden">
              <Button
                aria-expanded={mobileActionsOpen}
                aria-haspopup="menu"
                aria-label="更多阅读操作"
                className="flex h-10 w-10 items-center justify-center rounded-xl p-0 text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                onClick={() => setMobileActionsOpen((open) => !open)}
                title="更多阅读操作"
                type="button"
                variant="ghost"
              >
                <MoreHorizontal className="h-5 w-5" />
              </Button>
              {mobileActionsOpen && (
                <div
                className="absolute right-0 top-[calc(100%+0.5rem)] z-[60] w-48 rounded-xl border p-2 text-sm shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)] backdrop-blur-xl"
                data-reader-interactive="true"
                role="menu"
                style={{
                  background: withOpacity(uiScheme.cardBg, isDark ? 0.94 : 0.98),
                  borderColor: withOpacity(uiScheme.cardBorder, isDark ? 0.22 : 0.14),
                  color: uiScheme.fg,
                }}
              >
                <div className="px-2 pb-1.5 pt-1 text-xs font-medium text-muted-foreground">
                  阅读操作
                </div>
                <button
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                  onClick={() => {
                    closeMobileActions();
                    onTocOpenChange(true);
                  }}
                  role="menuitem"
                  type="button"
                >
                  <List className="h-4 w-4" />
                  <span>目录</span>
                </button>
                <button
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                  onClick={() => {
                    closeMobileActions();
                    onBookmarksOpenChange(true);
                  }}
                  role="menuitem"
                  type="button"
                >
                  <BookmarkIcon className="h-4 w-4" />
                  <span>书签</span>
                </button>
                <button
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canCreateBookmark || isSavingBookmark}
                  onClick={() => {
                    closeMobileActions();
                    onCreateBookmark();
                  }}
                  role="menuitem"
                  type="button"
                >
                  <BookmarkPlus className="h-4 w-4" />
                  <span>{isSavingBookmark ? "添加中..." : "添加书签"}</span>
                </button>
                <div onClick={closeMobileActions}>
                  {mobileTtsControls}
                </div>
                <button
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                  onClick={() => {
                    closeMobileActions();
                    onThemeSettingsOpenChange(true);
                  }}
                  role="menuitem"
                  type="button"
                >
                  <Settings className="h-4 w-4" />
                  <span>设置</span>
                </button>
                <button
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                  onClick={() => {
                    closeMobileActions();
                    onToggleFullscreen();
                  }}
                  role="menuitem"
                  type="button"
                >
                  {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                  <span>{isFullscreen ? "退出全屏" : "全屏"}</span>
                </button>
              </div>
              )}
            </div>

            <div data-reader-toolbar-actions="desktop" className="hidden items-center gap-1 sm:flex sm:gap-4">
            <ReaderTOCSheet
              open={tocOpen}
              onOpenChange={onTocOpenChange}
              toc={toc}
              bookTitle={bookTitle}
              bookAuthor={bookAuthor}
              tocListRef={tocListRef}
              currentChapter={currentChapter}
              currentChapterHref={currentChapterHref}
              uiScheme={uiScheme}
              overlayContainer={overlayContainer}
              triggerClassName="flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground sm:px-3 sm:text-sm"
              triggerStyle={{}}
              onLocateCurrent={onLocateCurrentChapter}
              onGoTo={onGoTo}
              trigger={
                <div className="flex items-center gap-2">
                  <List className="h-4 w-4" />
                  <span className="hidden sm:inline">目录</span>
                </div>
              }
            />

            <ReaderBookmarksSheet
              open={bookmarksOpen}
              onOpenChange={onBookmarksOpenChange}
              bookmarks={bookmarks}
              bookTitle={bookTitle}
              uiScheme={uiScheme}
              overlayContainer={overlayContainer}
              triggerClassName="flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground sm:px-3 sm:text-sm"
              triggerStyle={{}}
              canCreate={canCreateBookmark}
              isSaving={isSavingBookmark}
              onCreate={onCreateBookmark}
              onGoTo={onGoToBookmark}
              onDelete={onDeleteBookmark}
              trigger={
                <div className="flex items-center gap-2">
                  <BookmarkIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">书签</span>
                </div>
              }
            />

            <Button
              variant="ghost"
              size="sm"
              disabled={!canCreateBookmark || isSavingBookmark}
              onClick={onCreateBookmark}
              title={canCreateBookmark ? "添加当前位置为书签" : "当前位置尚未就绪"}
              className="flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground sm:px-3 sm:text-sm"
            >
              <BookmarkPlus className="h-4 w-4" />
              <span className="hidden sm:inline">{isSavingBookmark ? "添加中..." : "添加"}</span>
            </Button>

            {ttsControls}

            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleFullscreen}
              title={isFullscreen ? "退出全屏" : "全屏阅读"}
              className="flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground sm:px-3 sm:text-sm"
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              <span className="hidden sm:inline">{isFullscreen ? "退出" : "全屏"}</span>
            </Button>

            <ThemeSettings
              theme={theme}
              setTheme={setTheme}
              uiScheme={uiScheme}
              open={themeSettingsOpen}
              onOpenChange={onThemeSettingsOpenChange}
              overlayContainer={overlayContainer}
              triggerClassName="flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground sm:px-3 sm:text-sm"
              triggerStyle={{}}
              trigger={
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  <span className="hidden sm:inline">设置</span>
                </div>
              }
            />
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
