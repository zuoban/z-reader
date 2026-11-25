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
  Loader2,
  Maximize,
  Minimize,
  MoreHorizontal,
  Search,
  Settings,
} from "lucide-react";

import { ReaderTOCSheet } from "@/components/reader/ReaderTOCSheet";
import type { ReaderTheme, ThemeColors } from "@/hooks/useReaderTheme";
import type { Bookmark } from "@/lib/api";
import type { TOCItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const ReaderBookmarksSheet = dynamic(() =>
  import("@/components/reader/ReaderBookmarksSheet").then(
    (module) => module.ReaderBookmarksSheet
  )
);
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
  onUpdateBookmarkNote?: (bookmarkId: string, note: string) => Promise<boolean> | void;
  isSavingOffline?: boolean;
  offlineDownloadLabel?: string;
  onSaveOffline?: () => void;
  ttsControls?: ReactNode;
  mobileTtsControls?: ReactNode;
  ttsOpen?: boolean;
  tocListRef: RefObject<HTMLDivElement | null>;
  currentChapter: string;
  currentChapterHref: string;
  onLocateCurrentChapter: () => void;
  onGoTo: (href: string) => void;
  percentage?: number;
  onGoToFraction?: (fraction: number) => void;
  jumpBackPercentage?: number | null;
  onReturnToPreviousLocation?: () => void;
  onBack: () => void;
  uiScheme: ThemeColors;
  headerSafeAreaPaddingTop: string;
  overlayContainer?: HTMLElement | null;
  theme: ReaderTheme;
  setTheme: (theme: Partial<ReaderTheme>) => void;
  themeSettingsOpen: boolean;
  onThemeSettingsOpenChange: (open: boolean) => void;
  isFullscreenSupported?: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenShortcuts?: () => void;
  searchOpen?: boolean;
  onOpenSearch?: () => void;
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
  onUpdateBookmarkNote,
  isSavingOffline = false,
  offlineDownloadLabel,
  onSaveOffline,
  ttsControls,
  mobileTtsControls,
  ttsOpen = false,
  tocListRef,
  currentChapter,
  currentChapterHref,
  onLocateCurrentChapter,
  onGoTo,
  percentage,
  onGoToFraction,
  jumpBackPercentage,
  onReturnToPreviousLocation,
  onBack,
  uiScheme,
  headerSafeAreaPaddingTop,
  overlayContainer,
  theme,
  setTheme,
  themeSettingsOpen,
  onThemeSettingsOpenChange,
  isFullscreenSupported = true,
  isFullscreen,
  onToggleFullscreen,
  onOpenShortcuts,
  searchOpen = false,
  onOpenSearch,
}: ReaderToolbarProps) {
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [prevVisible, setPrevVisible] = useState(visible);
  const anySheetOpen =
    tocOpen || bookmarksOpen || themeSettingsOpen || ttsOpen || searchOpen;
  const [prevAnySheetOpen, setPrevAnySheetOpen] = useState(anySheetOpen);
  const [settingsRequested, setSettingsRequested] = useState(false);
  const [tocRequested, setTocRequested] = useState(false);
  const [bookmarksRequested, setBookmarksRequested] = useState(false);
  const mobileActionsButtonRef = useRef<HTMLButtonElement>(null);
  const mobileActionsMenuRef = useRef<HTMLDivElement>(null);
  const mobileActionsMenuId = useId();
  const mobileActionsTitleId = useId();

  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (!visible && mobileActionsOpen) {
      setMobileActionsOpen(false);
    }
  }

  if (anySheetOpen !== prevAnySheetOpen) {
    setPrevAnySheetOpen(anySheetOpen);
    if (anySheetOpen && mobileActionsOpen) {
      setMobileActionsOpen(false);
    }
  }

  function closeMobileActions(returnFocus = true) {
    setMobileActionsOpen(false);
    if (returnFocus) {
      requestAnimationFrame(() => mobileActionsButtonRef.current?.focus());
    }
  }

  useEffect(() => {
    void import("@/components/reader/ReaderBookmarksSheet").catch(() => {});
    void import("@/components/ThemeSettings").catch(() => {});
  }, []);

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
        closeMobileActions(false);
      }
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      closeMobileActions();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileActionsOpen]);

  function handleMobileActionsKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      if (event.nativeEvent.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      closeMobileActions();
      return;
    }

    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }

    const items = Array.from(
      mobileActionsMenuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []
    );
    if (items.length === 0) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Home") {
      items[0]?.focus();
      return;
    }
    if (event.key === "End") {
      items[items.length - 1]?.focus();
      return;
    }

    const activeIndex = items.findIndex((item) => item === document.activeElement);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex =
      activeIndex === -1
        ? delta > 0
          ? 0
          : items.length - 1
        : (activeIndex + delta + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  const chromeBtnClass = "reader-chrome-btn";
  const author = bookAuthor.trim();

  return (
    <>
      <header
        data-reader-interactive="true"
        aria-hidden={!visible || undefined}
        inert={!visible || undefined}
        className={`reader-chrome reader-chrome-surface pointer-events-none border-b absolute inset-x-0 top-0 z-50 transition-[transform,opacity] duration-200 ease-out ${
          visible
            ? "translate-y-0 opacity-100"
            : "-translate-y-[calc(100%+env(safe-area-inset-top,0px))] opacity-0"
        }`}
        style={{
          "--reader-chrome-bg": uiScheme.bg,
          "--reader-chrome-menu-bg": uiScheme.cardBg,
          "--reader-chrome-rule": uiScheme.cardBorder,
          "--reader-chrome-ink": uiScheme.fg,
          "--reader-chrome-muted": uiScheme.mutedText,
          "--reader-chrome-hover": uiScheme.buttonBg,
          "--reader-chrome-accent": uiScheme.link,
          paddingTop: headerSafeAreaPaddingTop,
        } as React.CSSProperties}
      >
        <div
          className={cn(
            "mx-auto flex h-[calc(var(--reader-toolbar-height)-1px)] max-w-6xl items-center pl-[max(0.5rem,env(safe-area-inset-left,0px))] pr-[max(0.5rem,env(safe-area-inset-right,0px))] sm:pl-[max(1.5rem,env(safe-area-inset-left,0px))] sm:pr-[max(1.5rem,env(safe-area-inset-right,0px))]",
            visible ? "pointer-events-auto" : "pointer-events-none"
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1.5 pr-2 sm:gap-2 sm:pr-4">
            <ActionIcon
              variant="subtle"
              size={36}
              radius="md"
              onClick={onBack}
              title="返回书库"
              aria-label="返回书库"
              className="reader-chrome-icon reader-toolbar-edge"
            >
              <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
            </ActionIcon>
            <div className="flex min-w-0 items-baseline gap-2">
              <h1
                className="reader-toolbar-title min-w-0 truncate text-[13px] leading-5 font-medium sm:text-sm"
                title={bookTitle || undefined}
              >
                {bookTitle || "阅读中"}
              </h1>
              {author && (
                <span className="reader-toolbar-author hidden max-w-[10rem] shrink-0 truncate text-xs leading-4 xl:inline">
                  · {author}
                </span>
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
                <MoreHorizontal className="size-4" strokeWidth={1.5} aria-hidden="true" />
              </ActionIcon>
              <div
                ref={mobileActionsMenuRef}
                id={mobileActionsMenuId}
                aria-hidden={!mobileActionsOpen}
                inert={!mobileActionsOpen || undefined}
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
                  <List className="h-4 w-4 opacity-80" aria-hidden="true" />
                  <span>目录</span>
                </button>
                {onOpenSearch && (
                  <button
                    className="reader-mobile-menu-item"
                    onClick={() => {
                      closeMobileActions(false);
                      onOpenSearch();
                    }}
                    type="button"
                  >
                    <Search className="h-4 w-4 opacity-80" aria-hidden="true" />
                    <span>书内搜索</span>
                  </button>
                )}
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
                      <BookmarkIcon className="h-4 w-4 opacity-80" aria-hidden="true" />
                      <span>书签</span>
                    </button>
                    <button
                      className="reader-mobile-menu-item"
                      disabled={!canCreateBookmark || isSavingBookmark}
                      aria-busy={isSavingBookmark || undefined}
                      onClick={() => {
                        closeMobileActions(false);
                        onCreateBookmark();
                      }}
                      type="button"
                    >
                      {isSavingBookmark ? (
                        <Loader2
                          className="h-4 w-4 animate-spin opacity-80 motion-reduce:animate-none"
                          aria-hidden="true"
                        />
                      ) : (
                        <BookmarkPlus className="h-4 w-4 opacity-80" aria-hidden="true" />
                      )}
                      <span>{isSavingBookmark ? "添加中..." : "添加书签"}</span>
                    </button>
                  </>
                )}
                {onSaveOffline && (
                  <button
                    className="reader-mobile-menu-item"
                    disabled={isSavingOffline}
                    aria-busy={isSavingOffline || undefined}
                    onClick={() => {
                      closeMobileActions(false);
                      onSaveOffline();
                    }}
                    type="button"
                  >
                    {isSavingOffline ? (
                      <Loader2
                        className="h-4 w-4 animate-spin opacity-80 motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                    ) : (
                      <Download className="h-4 w-4 opacity-80" aria-hidden="true" />
                    )}
                    <span className="tabular-nums">
                      {isSavingOffline ? offlineDownloadLabel ?? "保存中..." : "保存离线副本"}
                    </span>
                  </button>
                )}
                {mobileTtsControls}
                <div className="reader-toolbar-menu-divider" role="separator" />
                <button
                  className="reader-mobile-menu-item"
                  onClick={() => {
                    closeMobileActions(false);
                    onThemeSettingsOpenChange(true);
                  }}
                  type="button"
                >
                  <Settings className="h-4 w-4 opacity-80" aria-hidden="true" />
                  <span>设置</span>
                </button>
                {isFullscreenSupported && (
                  <button
                    className="reader-mobile-menu-item"
                    aria-pressed={isFullscreen}
                    onClick={() => {
                      closeMobileActions(false);
                      onToggleFullscreen();
                    }}
                    type="button"
                  >
                    {isFullscreen ? (
                      <Minimize className="h-4 w-4 opacity-80" aria-hidden="true" />
                    ) : (
                      <Maximize className="h-4 w-4 opacity-80" aria-hidden="true" />
                    )}
                    <span>{isFullscreen ? "退出全屏" : "全屏"}</span>
                  </button>
                )}
                {onOpenShortcuts && (
                  <button
                    className="reader-mobile-menu-item"
                    onClick={() => {
                      closeMobileActions(false);
                      onOpenShortcuts();
                    }}
                    type="button"
                  >
                    <KeyboardIcon className="h-4 w-4 opacity-80" aria-hidden="true" />
                    <span>快捷键</span>
                  </button>
                )}
              </div>
            </div>

            <div
              data-reader-toolbar-actions="desktop"
              className="reader-toolbar-actions hidden items-center gap-0.5 lg:flex"
            >
              {tocRequested || tocOpen ? (
                <ReaderTOCSheet
                  open={tocOpen}
                  onOpenChange={(open) => {
                    setTocRequested(true);
                    onTocOpenChange(open);
                  }}
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
                  percentage={percentage}
                  onGoToFraction={onGoToFraction}
                  jumpBackPercentage={jumpBackPercentage}
                  onReturnToPreviousLocation={onReturnToPreviousLocation}
                  trigger={
                    <>
                      <List className="size-4" strokeWidth={1.5} aria-hidden="true" />
                      <span className="sr-only">目录</span>
                    </>
                  }
                />
              ) : (
                <Button
                  type="button"
                  variant="subtle"
                  size="sm"
                  title="目录"
                  aria-expanded={tocOpen}
                  aria-haspopup="dialog"
                  className={chromeBtnClass}
                  classNames={{ label: "flex items-center justify-center" }}
                  onClick={() => {
                    setTocRequested(true);
                    onTocOpenChange(true);
                  }}
                >
                  <List className="size-4" strokeWidth={1.5} aria-hidden="true" />
                  <span className="sr-only">目录</span>
                </Button>
              )}

              {onOpenSearch && (
                <ActionIcon
                  type="button"
                  variant="subtle"
                  size={32}
                  radius="md"
                  onClick={onOpenSearch}
                  aria-label="书内搜索"
                  aria-expanded={searchOpen}
                  aria-haspopup="dialog"
                  title="书内搜索 (Ctrl/⌘+F)"
                  className={chromeBtnClass}
                >
                  <Search className="size-4" strokeWidth={1.5} aria-hidden="true" />
                </ActionIcon>
              )}

              {showBookmarks && (
                <>
                  {bookmarksRequested || bookmarksOpen ? (
                    <ReaderBookmarksSheet
                      open={bookmarksOpen}
                      onOpenChange={(open) => {
                        setBookmarksRequested(true);
                        onBookmarksOpenChange(open);
                      }}
                      bookmarks={bookmarks}
                      bookTitle={bookTitle}
                      bookAuthor={bookAuthor}
                      uiScheme={uiScheme}
                      overlayContainer={overlayContainer}
                      triggerClassName={chromeBtnClass}
                      triggerStyle={{}}
                      canCreate={canCreateBookmark}
                      isSaving={isSavingBookmark}
                      onCreate={onCreateBookmark}
                      onGoTo={onGoToBookmark}
                      onDelete={onDeleteBookmark}
                      onUpdateNote={onUpdateBookmarkNote}
                      trigger={
                        <>
                          <BookmarkIcon className="size-4" strokeWidth={1.5} aria-hidden="true" />
                          <span className="sr-only">书签</span>
                        </>
                      }
                    />
                  ) : (
                    <Button
                      type="button"
                      variant="subtle"
                      size="sm"
                      title="书签"
                      aria-expanded={bookmarksOpen}
                      aria-haspopup="dialog"
                      className={chromeBtnClass}
                      classNames={{ label: "flex items-center justify-center" }}
                      onClick={() => {
                        setBookmarksRequested(true);
                        onBookmarksOpenChange(true);
                      }}
                    >
                      <BookmarkIcon className="size-4" strokeWidth={1.5} aria-hidden="true" />
                      <span className="sr-only">书签</span>
                    </Button>
                  )}

                  <Button
                    type="button"
                    variant="subtle"
                    size="sm"
                    disabled={!canCreateBookmark || isSavingBookmark}
                    aria-busy={isSavingBookmark || undefined}
                    onClick={onCreateBookmark}
                    title={canCreateBookmark ? "添加当前位置为书签" : "当前位置尚未就绪"}
                    className={chromeBtnClass}
                    classNames={{ label: "flex items-center justify-center" }}
                  >
                    {isSavingBookmark ? (
                      <Loader2
                        className="size-4 animate-spin motion-reduce:animate-none"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    ) : (
                      <BookmarkPlus className="size-4" strokeWidth={1.5} aria-hidden="true" />
                    )}
                    <span className="sr-only">
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
                  aria-busy={isSavingOffline || undefined}
                  onClick={onSaveOffline}
                  title="保存到此设备，退出登录后会自动清除"
                  className={cn(
                    chromeBtnClass,
                    isSavingOffline && "reader-chrome-btn-expanded"
                  )}
                  classNames={{ label: "flex items-center justify-center gap-1.5" }}
                >
                  {isSavingOffline ? (
                    <Loader2
                      className="size-4 animate-spin motion-reduce:animate-none"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  ) : (
                    <Download className="size-4" strokeWidth={1.5} aria-hidden="true" />
                  )}
                  <span className={isSavingOffline ? "text-[11px]" : "sr-only"}>
                    {isSavingOffline ? offlineDownloadLabel ?? "保存中..." : "离线"}
                  </span>
                </Button>
              )}

              {ttsControls}

              <span
                aria-hidden="true"
                className="reader-toolbar-divider mx-1 h-3.5 w-px shrink-0"
              />

              {isFullscreenSupported && (
                <Button
                  type="button"
                  variant="subtle"
                  size="sm"
                  aria-pressed={isFullscreen}
                  onClick={onToggleFullscreen}
                  title={isFullscreen ? "退出全屏" : "全屏阅读"}
                  className={chromeBtnClass}
                  classNames={{ label: "flex items-center justify-center" }}
                >
                  {isFullscreen ? (
                    <Minimize className="size-4" strokeWidth={1.5} aria-hidden="true" />
                  ) : (
                    <Maximize className="size-4" strokeWidth={1.5} aria-hidden="true" />
                  )}
                  <span className="sr-only">{isFullscreen ? "退出全屏" : "全屏"}</span>
                </Button>
              )}

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
                  <>
                    <Settings className="size-4" strokeWidth={1.5} aria-hidden="true" />
                    <span className="sr-only">设置</span>
                  </>
                }
              /> : (
                <Button
                  type="button"
                  variant="subtle"
                  size="sm"
                  title="阅读设置"
                  aria-expanded={themeSettingsOpen}
                  aria-haspopup="dialog"
                  className={chromeBtnClass}
                  classNames={{ label: "flex items-center justify-center" }}
                  onClick={() => {
                    setSettingsRequested(true);
                    onThemeSettingsOpenChange(true);
                  }}
                >
                  <Settings className="size-4" strokeWidth={1.5} aria-hidden="true" />
                  <span className="sr-only">设置</span>
                </Button>
              )}

              {onOpenShortcuts && (
                <ActionIcon
                  type="button"
                  variant="subtle"
                  size={32}
                  radius="md"
                  onClick={onOpenShortcuts}
                  title="快捷键 (?)"
                  aria-label="快捷键"
                  className={chromeBtnClass}
                >
                  <KeyboardIcon className="size-4" strokeWidth={1.5} aria-hidden="true" />
                </ActionIcon>
              )}
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
