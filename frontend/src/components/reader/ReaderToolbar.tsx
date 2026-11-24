"use client";

import dynamic from "next/dynamic";
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { ActionIcon, Button } from "@mantine/core";
import {
  ArrowLeft,
  Bookmark as BookmarkIcon,
  BookmarkPlus,
  Download,
  Keyboard as KeyboardIcon,
  List,
  Maximize,
  Minimize,
  MoreHorizontal,
  Settings,
} from "lucide-react";

import { ReaderBookmarksSheet } from "@/components/reader/ReaderBookmarksSheet";
import { ReaderTOCSheet } from "@/components/reader/ReaderTOCSheet";
import type { ReaderTheme, ThemeColors } from "@/hooks/useReaderTheme";
import type { Bookmark } from "@/lib/api";
import type { TOCItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const ThemeSettings = dynamic(() => import("@/components/ThemeSettings")
  .then((module) => module.ThemeSettings));

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
  showBookmarks?: boolean;
  canCreateBookmark: boolean;
  isSavingBookmark: boolean;
  onCreateBookmark: () => void;
  onGoToBookmark: (bookmark: Bookmark) => void;
  onDeleteBookmark: (bookmarkId: string) => void;
  isSavingOffline?: boolean;
  offlineDownloadLabel?: string;
  onSaveOffline?: () => void;
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
  onOpenShortcuts?: () => void;
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
  showBookmarks = true,
  canCreateBookmark,
  isSavingBookmark,
  onCreateBookmark,
  onGoToBookmark,
  onDeleteBookmark,
  isSavingOffline = false,
  offlineDownloadLabel,
  onSaveOffline,
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
  onOpenShortcuts,
}: ReaderToolbarProps) {
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [settingsRequested, setSettingsRequested] = useState(false);
  const mobileActionsButtonRef = useRef<HTMLButtonElement>(null);
  const mobileActionsMenuRef = useRef<HTMLDivElement>(null);
  const mobileActionsMenuId = useId();
  const mobileActionsTitleId = useId();

  function closeMobileActions(returnFocus = true) {
    setMobileActionsOpen(false);
    if (returnFocus) {
      requestAnimationFrame(() => mobileActionsButtonRef.current?.focus());
    }
  }

  useEffect(() => {
    if (!mobileActionsOpen) return;

    mobileActionsMenuRef.current?.querySelector<HTMLButtonElement>(
      "button:not(:disabled)"
    )?.focus();
  }, [mobileActionsOpen]);

  useEffect(() => {
    if (!mobileActionsOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        !mobileActionsMenuRef.current?.contains(target) &&
        !mobileActionsButtonRef.current?.contains(target)
      ) {
        closeMobileActions();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [mobileActionsOpen]);

  function handleMobileActionsKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;

    event.preventDefault();
    event.stopPropagation();
    closeMobileActions();
  }

  const chromeBtnClass = "reader-chrome-btn";
  const author = bookAuthor.trim();

  return (
    <>
      <header
        data-reader-interactive="true"
        className={`reader-chrome reader-chrome-surface pointer-events-none border-b absolute inset-x-0 top-0 z-50 transition-[transform,opacity] duration-200 ease-out ${
          visible
            ? "translate-y-0 opacity-100"
            : "-translate-y-[calc(100%+env(safe-area-inset-top,0px))] opacity-0"
        }`}
        style={{
          "--reader-chrome-bg": uiScheme.cardBg,
          "--reader-chrome-rule": uiScheme.cardBorder,
          "--reader-chrome-ink": uiScheme.fg,
          "--reader-chrome-muted": uiScheme.mutedText,
          "--reader-chrome-hover": uiScheme.buttonBg,
          "--reader-chrome-accent": uiScheme.link,
          paddingTop: headerSafeAreaPaddingTop,
        } as React.CSSProperties}
      >
        <div className="pointer-events-auto mx-auto flex h-[calc(var(--reader-toolbar-height)-1px)] max-w-6xl items-center pl-[max(0.5rem,env(safe-area-inset-left,0px))] pr-[max(0.5rem,env(safe-area-inset-right,0px))] sm:pl-[max(1.5rem,env(safe-area-inset-left,0px))] sm:pr-[max(1.5rem,env(safe-area-inset-right,0px))]">
          <div className="flex min-w-0 flex-1 items-center gap-2 pr-2 sm:gap-3 sm:pr-4">
            <ActionIcon
              variant="subtle"
              size={36}
              radius="md"
              onClick={onBack}
              title="返回书库"
              aria-label="返回书库"
              className="reader-chrome-icon reader-toolbar-edge"
            >
              <ArrowLeft className="size-5" strokeWidth={1.75} aria-hidden="true" />
            </ActionIcon>
            <div className="min-w-0">
              <h1 className="truncate font-heading text-base leading-5 font-semibold sm:text-lg sm:leading-6">
                {bookTitle || "阅读中"}
              </h1>
              {author && (
                <p className="truncate text-xs leading-4 text-[var(--reader-chrome-muted)]">{author}</p>
              )}
            </div>
          </div>

          <div className="relative flex shrink-0 items-center gap-0.5 sm:gap-1">
            <div className="lg:hidden">
              <ActionIcon
                ref={mobileActionsButtonRef}
                aria-expanded={mobileActionsOpen}
                aria-haspopup="dialog"
                aria-label="更多阅读操作"
                aria-controls={mobileActionsOpen ? mobileActionsMenuId : undefined}
                className="reader-chrome-icon reader-toolbar-edge"
                onClick={() => setMobileActionsOpen((open) => !open)}
                title="更多阅读操作"
                type="button"
                variant="subtle"
                size={44}
                radius="md"
              >
                <MoreHorizontal className="size-5" strokeWidth={1.75} aria-hidden="true" />
              </ActionIcon>
              <div
                ref={mobileActionsMenuRef}
                id={mobileActionsMenuId}
                aria-hidden={!mobileActionsOpen}
                aria-labelledby={mobileActionsTitleId}
                className={cn(
                  "reader-toolbar-menu absolute right-0 top-[calc(100%+0.5rem)] z-[60] max-h-[calc(100dvh-5.5rem)] w-52 max-w-[calc(100vw-2rem)] origin-top-right overflow-y-auto overscroll-contain p-1.5 text-sm transition-[opacity,transform] duration-150 ease-out scrollbar-none",
                  mobileActionsOpen
                    ? "visible translate-y-0 opacity-100"
                    : "pointer-events-none invisible -translate-y-1 opacity-0"
                )}
                data-reader-interactive="true"
                onKeyDown={handleMobileActionsKeyDown}
                role="dialog"
              >
                <div id={mobileActionsTitleId} className="reader-toolbar-menu-title">
                  阅读操作
                </div>
                <button
                  className="reader-mobile-menu-item"
                  onClick={() => {
                    closeMobileActions(false);
                    onTocOpenChange(true);
                  }}
                  type="button"
                >
                  <List className="h-4 w-4 opacity-80" />
                  <span>目录</span>
                </button>
                {showBookmarks && (
                  <>
                    <button
                      className="reader-mobile-menu-item"
                      onClick={() => {
                        closeMobileActions(false);
                        onBookmarksOpenChange(true);
                      }}
                      type="button"
                    >
                      <BookmarkIcon className="h-4 w-4 opacity-80" />
                      <span>书签</span>
                    </button>
                    <button
                      className="reader-mobile-menu-item"
                      disabled={!canCreateBookmark || isSavingBookmark}
                      onClick={() => {
                        closeMobileActions(false);
                        onCreateBookmark();
                      }}
                      type="button"
                    >
                      <BookmarkPlus className="h-4 w-4 opacity-80" />
                      <span>{isSavingBookmark ? "添加中..." : "添加书签"}</span>
                    </button>
                  </>
                )}
                {onSaveOffline && (
                  <button
                    className="reader-mobile-menu-item"
                    disabled={isSavingOffline}
                    onClick={() => {
                      closeMobileActions(false);
                      onSaveOffline();
                    }}
                    type="button"
                  >
                    <Download className="h-4 w-4 opacity-80" />
                    <span>
                      {isSavingOffline ? offlineDownloadLabel ?? "保存中..." : "保存离线副本"}
                    </span>
                  </button>
                )}
                {mobileTtsControls}
                <button
                  className="reader-mobile-menu-item"
                  onClick={() => {
                    closeMobileActions(false);
                    onThemeSettingsOpenChange(true);
                  }}
                  type="button"
                >
                  <Settings className="h-4 w-4 opacity-80" />
                  <span>设置</span>
                </button>
                <button
                  className="reader-mobile-menu-item"
                  onClick={() => {
                    closeMobileActions(false);
                    onToggleFullscreen();
                  }}
                  type="button"
                >
                  {isFullscreen ? (
                    <Minimize className="h-4 w-4 opacity-80" />
                  ) : (
                    <Maximize className="h-4 w-4 opacity-80" />
                  )}
                  <span>{isFullscreen ? "退出全屏" : "全屏"}</span>
                </button>
                {onOpenShortcuts && (
                  <button
                    className="reader-mobile-menu-item"
                    onClick={() => {
                      closeMobileActions(false);
                      onOpenShortcuts();
                    }}
                    type="button"
                  >
                    <KeyboardIcon className="h-4 w-4 opacity-80" />
                    <span>快捷键</span>
                  </button>
                )}
              </div>
            </div>

            <div
              data-reader-toolbar-actions="desktop"
              className="reader-toolbar-actions hidden items-center gap-0.5 lg:flex"
            >
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
                triggerClassName={chromeBtnClass}
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

              {showBookmarks && (
                <>
                  <ReaderBookmarksSheet
                    open={bookmarksOpen}
                    onOpenChange={onBookmarksOpenChange}
                    bookmarks={bookmarks}
                    bookTitle={bookTitle}
                    uiScheme={uiScheme}
                    overlayContainer={overlayContainer}
                    triggerClassName={chromeBtnClass}
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
                    type="button"
                    variant="subtle"
                    size="sm"
                    disabled={!canCreateBookmark || isSavingBookmark}
                    onClick={onCreateBookmark}
                    title={canCreateBookmark ? "添加当前位置为书签" : "当前位置尚未就绪"}
                    className={chromeBtnClass}
                    classNames={{ label: "flex items-center gap-1.5" }}
                  >
                    <BookmarkPlus className="h-4 w-4" />
                    <span className="hidden sm:inline">
                      {isSavingBookmark ? "添加中..." : "添加"}
                    </span>
                  </Button>
                </>
              )}

              {onSaveOffline && (
                <Button
                  type="button"
                  variant="subtle"
                  size="sm"
                  disabled={isSavingOffline}
                  onClick={onSaveOffline}
                  title="保存到此设备，退出登录后会自动清除"
                  className={chromeBtnClass}
                  classNames={{ label: "flex items-center gap-1.5" }}
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {isSavingOffline ? offlineDownloadLabel ?? "保存中..." : "离线"}
                  </span>
                </Button>
              )}

              {ttsControls}

              <Button
                type="button"
                variant="subtle"
                size="sm"
                onClick={onToggleFullscreen}
                title={isFullscreen ? "退出全屏" : "全屏阅读"}
                className={chromeBtnClass}
                classNames={{ label: "flex items-center gap-1.5" }}
              >
                {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                <span className="hidden sm:inline">{isFullscreen ? "退出" : "全屏"}</span>
              </Button>

              {settingsRequested || themeSettingsOpen ? <ThemeSettings
                theme={theme}
                setTheme={setTheme}
                uiScheme={uiScheme}
                open={themeSettingsOpen}
                onOpenChange={(open) => {
                  setSettingsRequested(true);
                  onThemeSettingsOpenChange(open);
                }}
                overlayContainer={overlayContainer}
                triggerClassName={chromeBtnClass}
                triggerStyle={{}}
                trigger={
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    <span className="hidden sm:inline">设置</span>
                  </div>
                }
              /> : (
                <Button
                  type="button"
                  variant="subtle"
                  size="sm"
                  title="阅读设置"
                  className={chromeBtnClass}
                  classNames={{ label: "flex items-center gap-1.5" }}
                  onClick={() => {
                    setSettingsRequested(true);
                    onThemeSettingsOpenChange(true);
                  }}
                >
                  <Settings className="h-4 w-4" />
                  <span className="hidden sm:inline">设置</span>
                </Button>
              )}

              {onOpenShortcuts && (
                <ActionIcon
                  type="button"
                  variant="subtle"
                  size={36}
                  radius="md"
                  onClick={onOpenShortcuts}
                  title="快捷键 (?)"
                  aria-label="快捷键"
                  className={cn(chromeBtnClass, "h-9 w-9 min-h-0 min-w-0 p-0")}
                >
                  <KeyboardIcon className="h-4 w-4" />
                </ActionIcon>
              )}
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
