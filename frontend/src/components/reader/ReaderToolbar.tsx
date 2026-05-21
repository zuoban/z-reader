"use client";

import { type CSSProperties, type RefObject } from "react";
import { ArrowLeft, Bookmark as BookmarkIcon, BookmarkPlus, Check, List, Settings } from "lucide-react";

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
  tocListRef: RefObject<HTMLDivElement | null>;
  currentChapter: string;
  currentChapterHref: string;
  onLocateCurrentChapter: () => void;
  onGoTo: (href: string) => void;
  onBack: () => void;
  uiScheme: ThemeColors;
  toolbarButtonClass: string;
  getToolbarButtonStyle: (active?: boolean) => CSSProperties;
  headerSafeAreaPaddingTop: string;
  overlayContainer?: HTMLElement | null;
  theme: ReaderTheme;
  setTheme: (theme: Partial<ReaderTheme>) => void;
  themeSettingsOpen: boolean;
  onThemeSettingsOpenChange: (open: boolean) => void;
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
  tocListRef,
  currentChapter,
  currentChapterHref,
  onLocateCurrentChapter,
  onGoTo,
  onBack,
  uiScheme,
  toolbarButtonClass,
  getToolbarButtonStyle,
  headerSafeAreaPaddingTop,
  overlayContainer,
  theme,
  setTheme,
  themeSettingsOpen,
  onThemeSettingsOpenChange,
}: ReaderToolbarProps) {
  const isDark = theme.preset === "dark";

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
        <div className="pointer-events-auto mx-auto flex h-11 max-w-full items-center px-4 sm:h-12 sm:px-6">
          <div className="flex flex-1 items-center gap-2 overflow-hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              title="返回书库"
              className="h-9 w-9 shrink-0 text-muted-foreground transition-colors hover:text-foreground"
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

          <div className="flex items-center gap-1 sm:gap-4">
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
              triggerClassName="flex h-9 items-center gap-2 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground sm:px-3 sm:text-sm"
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
              triggerClassName="flex h-9 items-center gap-2 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground sm:px-3 sm:text-sm"
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
              className="flex h-9 items-center gap-2 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground sm:px-3 sm:text-sm"
            >
              <BookmarkPlus className="h-4 w-4" />
              <span className="hidden sm:inline">{isSavingBookmark ? "添加中..." : "添加"}</span>
            </Button>

            <ThemeSettings
              theme={theme}
              setTheme={setTheme}
              uiScheme={uiScheme}
              open={themeSettingsOpen}
              onOpenChange={onThemeSettingsOpenChange}
              overlayContainer={overlayContainer}
              triggerClassName="flex h-9 items-center gap-2 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground sm:px-3 sm:text-sm"
              triggerStyle={{}}
              trigger={
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  <span className="hidden sm:inline">设置</span>
                </div>
              }
            />

            <div className="ml-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground/60 sm:ml-4 sm:text-sm">
              <Check className="h-3.5 w-3.5" />
              <span className="hidden md:inline">已同步</span>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}

