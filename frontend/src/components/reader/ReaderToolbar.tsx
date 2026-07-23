"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  Bookmark as BookmarkIcon,
  BookmarkPlus,
  Download,
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
import { cn } from "@/lib/utils";

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
}: ReaderToolbarProps) {
  const isDark = theme.preset === "dark";
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
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

    const firstMenuItem = mobileActionsMenuRef.current?.querySelector<HTMLButtonElement>(
      "button:not(:disabled)"
    );
    firstMenuItem?.focus();
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
    closeMobileActions();
  }

  const chromeBtnClass =
    "reader-chrome-btn border-0 bg-transparent shadow-none hover:bg-black/[0.05] dark:hover:bg-white/[0.08]";

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
          background: `
            linear-gradient(180deg, ${withOpacity(uiScheme.fg, isDark ? 0.04 : 0.03)} 0%, transparent 100%),
            ${withOpacity(uiScheme.bg, isDark ? 0.94 : 0.92)}
          `,
          borderBottom: `1px solid ${withOpacity(uiScheme.cardBorder, isDark ? 0.18 : 0.1)}`,
          boxShadow: `0 10px 28px -22px ${withOpacity(uiScheme.fg, isDark ? 0.55 : 0.22)}`,
          backdropFilter: "blur(16px) saturate(1.15)",
          paddingTop: headerSafeAreaPaddingTop,
        }}
      >
        <div className="pointer-events-auto mx-auto flex h-12 max-w-full items-center px-3 sm:px-6">
          <div className="flex flex-1 items-center gap-1.5 overflow-hidden sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              title="返回书库"
              className="reader-chrome-icon h-10 w-10 shrink-0 border-0 bg-transparent shadow-none hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0 overflow-hidden">
              <h1
                className="truncate font-heading text-[0.98rem] font-semibold tracking-[-0.02em] sm:text-lg"
                style={{ color: uiScheme.fg }}
              >
                {bookTitle || "阅读中"}
              </h1>
            </div>
          </div>

          <div className="relative flex items-center gap-0.5 sm:gap-1.5">
            <div className="sm:hidden">
              <Button
                ref={mobileActionsButtonRef}
                aria-expanded={mobileActionsOpen}
                aria-haspopup="dialog"
                aria-label="更多阅读操作"
                aria-controls={mobileActionsOpen ? mobileActionsMenuId : undefined}
                className="reader-chrome-icon h-10 w-10 border-0 bg-transparent p-0 shadow-none hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
                onClick={() => setMobileActionsOpen((open) => !open)}
                title="更多阅读操作"
                type="button"
                variant="ghost"
              >
                <MoreHorizontal className="h-5 w-5" />
              </Button>
              <div
                ref={mobileActionsMenuRef}
                id={mobileActionsMenuId}
                aria-hidden={!mobileActionsOpen}
                aria-labelledby={mobileActionsTitleId}
                className={cn(
                  "absolute right-0 top-[calc(100%+0.5rem)] z-[60] max-h-[calc(100dvh-5.5rem)] w-52 max-w-[calc(100vw-2rem)] origin-top-right overflow-y-auto overscroll-contain rounded-2xl border p-1.5 text-sm shadow-[0_22px_48px_-28px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl transition-[opacity,transform,visibility] duration-150 ease-out scrollbar-none",
                  mobileActionsOpen
                    ? "visible translate-y-0 opacity-100"
                    : "pointer-events-none invisible -translate-y-1 opacity-0"
                )}
                data-reader-interactive="true"
                onKeyDown={handleMobileActionsKeyDown}
                role="dialog"
                style={{
                  background: withOpacity(uiScheme.cardBg, isDark ? 0.96 : 0.98),
                  borderColor: withOpacity(uiScheme.cardBorder, isDark ? 0.24 : 0.14),
                  color: uiScheme.fg,
                }}
              >
                <div
                  id={mobileActionsTitleId}
                  className="px-2.5 pb-1.5 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: withOpacity(uiScheme.fg, 0.48) }}
                >
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
                <div className="px-1 py-0.5">{mobileTtsControls}</div>
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
              </div>
            </div>

            <div
              data-reader-toolbar-actions="desktop"
              className="hidden items-center gap-0.5 sm:flex sm:gap-1"
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
                variant="ghost"
                size="sm"
                disabled={!canCreateBookmark || isSavingBookmark}
                onClick={onCreateBookmark}
                title={canCreateBookmark ? "添加当前位置为书签" : "当前位置尚未就绪"}
                className={chromeBtnClass}
              >
                <BookmarkPlus className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {isSavingBookmark ? "添加中..." : "添加"}
                </span>
              </Button>

              {onSaveOffline && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isSavingOffline}
                  onClick={onSaveOffline}
                  title="保存到此设备，退出登录后会自动清除"
                  className={chromeBtnClass}
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {isSavingOffline ? offlineDownloadLabel ?? "保存中..." : "离线"}
                  </span>
                </Button>
              )}

              {ttsControls}

              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleFullscreen}
                title={isFullscreen ? "退出全屏" : "全屏阅读"}
                className={chromeBtnClass}
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
                triggerClassName={chromeBtnClass}
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
