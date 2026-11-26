"use client";

import {
  type KeyboardEvent,
  type ReactNode,
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

import type { ThemeColors } from "@/hooks/useReaderTheme";
import {
  PRESET_STYLES,
  type ReaderThemePreset,
} from "@/lib/reader-theme-presets";
import { handleRovingListKeyDown, withOpacity } from "@/lib/reader-ui";
import { cn } from "@/lib/utils";

const QUICK_PRESETS: ReadonlyArray<{ key: ReaderThemePreset; label: string }> = [
  { key: "light", label: "净白" },
  { key: "sepia", label: "旧书" },
  { key: "green", label: "苔纸" },
  { key: "dark", label: "夜读" },
];

interface ReaderToolbarProps {
  visible: boolean;
  bookTitle: string;
  bookAuthor: string;
  tocOpen: boolean;
  onTocOpenChange: (open: boolean) => void;
  bookmarksOpen: boolean;
  onBookmarksOpenChange: (open: boolean) => void;
  showBookmarks?: boolean;
  bookmarkCount?: number;
  isCurrentBookmarked?: boolean;
  canCreateBookmark: boolean;
  isSavingBookmark: boolean;
  onCreateBookmark: () => void;
  isSavingOffline?: boolean;
  offlineDownloadLabel?: string;
  onSaveOffline?: () => void;
  ttsControls?: ReactNode;
  mobileTtsControls?: ReactNode;
  ttsOpen?: boolean;
  onBack: () => void;
  uiScheme: ThemeColors;
  activePreset?: ReaderThemePreset;
  onPresetChange?: (preset: ReaderThemePreset) => void;
  fontSize?: number;
  onFontSizeChange?: (fontSize: number) => void;
  headerSafeAreaPaddingTop: string;
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
  tocOpen,
  onTocOpenChange,
  bookmarksOpen,
  onBookmarksOpenChange,
  showBookmarks = true,
  bookmarkCount = 0,
  isCurrentBookmarked = false,
  canCreateBookmark,
  isSavingBookmark,
  onCreateBookmark,
  isSavingOffline = false,
  offlineDownloadLabel,
  onSaveOffline,
  ttsControls,
  mobileTtsControls,
  ttsOpen = false,
  onBack,
  uiScheme,
  activePreset,
  onPresetChange,
  fontSize,
  onFontSizeChange,
  headerSafeAreaPaddingTop,
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
    handleRovingListKeyDown(event, mobileActionsMenuRef.current, {
      stopPropagation: true,
    });
  }

  const chromeBtnClass = "reader-chrome-btn";
  const author = bookAuthor.trim();

  function renderMobileMenuItem({
    label,
    icon,
    onAction,
    disabled,
    busy,
    pressed,
    labelClassName,
  }: {
    label: string;
    icon: ReactNode;
    onAction: () => void;
    disabled?: boolean;
    busy?: boolean;
    pressed?: boolean;
    labelClassName?: string;
  }) {
    return (
      <button
        className="reader-mobile-menu-item"
        disabled={disabled}
        aria-busy={busy || undefined}
        aria-pressed={pressed}
        onClick={() => {
          closeMobileActions(false);
          onAction();
        }}
        type="button"
      >
        {icon}
        <span className={labelClassName}>{label}</span>
      </button>
    );
  }

  function renderDesktopButton({
    title,
    ariaLabel,
    srLabel,
    expanded,
    hasPopup,
    pressed,
    disabled,
    busy,
    dataBookmarked,
    className,
    labelClassName = "flex items-center justify-center",
    onClick,
    children,
  }: {
    title: string;
    ariaLabel?: string;
    srLabel?: string;
    expanded?: boolean;
    hasPopup?: "dialog";
    pressed?: boolean;
    disabled?: boolean;
    busy?: boolean;
    dataBookmarked?: boolean;
    className?: string;
    labelClassName?: string;
    onClick: () => void;
    children: ReactNode;
  }) {
    return (
      <Button
        type="button"
        variant="subtle"
        size="sm"
        title={title}
        aria-label={ariaLabel}
        aria-expanded={expanded}
        aria-haspopup={hasPopup}
        aria-pressed={pressed}
        disabled={disabled}
        aria-busy={busy || undefined}
        data-bookmarked={dataBookmarked ? "true" : undefined}
        className={cn(chromeBtnClass, className)}
        classNames={{ label: labelClassName }}
        onClick={onClick}
      >
        {children}
        {srLabel && <span className="sr-only">{srLabel}</span>}
      </Button>
    );
  }

  return (
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
              className="reader-toolbar-title font-heading min-w-0 truncate text-[14px] leading-5 font-medium sm:text-[15px]"
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
              {renderMobileMenuItem({
                label: "目录",
                icon: <List className="h-4 w-4 opacity-80" aria-hidden="true" />,
                onAction: () => onTocOpenChange(true),
              })}
              {onOpenSearch && renderMobileMenuItem({
                label: "书内搜索",
                icon: <Search className="h-4 w-4 opacity-80" aria-hidden="true" />,
                onAction: onOpenSearch,
              })}
              {showBookmarks && (
                <>
                  {renderMobileMenuItem({
                    label: "书签",
                    icon: <BookmarkIcon className="h-4 w-4 opacity-80" aria-hidden="true" />,
                    onAction: () => onBookmarksOpenChange(true),
                  })}
                  {renderMobileMenuItem({
                    label: isSavingBookmark ? "添加中..." : "添加书签",
                    disabled: !canCreateBookmark || isSavingBookmark,
                    busy: isSavingBookmark,
                    icon: isSavingBookmark ? (
                      <Loader2 className="h-4 w-4 animate-spin opacity-80 motion-reduce:animate-none" aria-hidden="true" />
                    ) : (
                      <BookmarkPlus className="h-4 w-4 opacity-80" aria-hidden="true" />
                    ),
                    onAction: onCreateBookmark,
                  })}
                </>
              )}
              {onSaveOffline && renderMobileMenuItem({
                label: isSavingOffline ? offlineDownloadLabel ?? "保存中..." : "保存离线副本",
                labelClassName: "tabular-nums",
                disabled: isSavingOffline,
                busy: isSavingOffline,
                icon: isSavingOffline ? (
                  <Loader2 className="h-4 w-4 animate-spin opacity-80 motion-reduce:animate-none" aria-hidden="true" />
                ) : (
                  <Download className="h-4 w-4 opacity-80" aria-hidden="true" />
                ),
                onAction: onSaveOffline,
              })}
              {mobileTtsControls}
              <div className="reader-toolbar-menu-divider" role="separator" />
              {renderMobileMenuItem({
                label: "设置",
                icon: <Settings className="h-4 w-4 opacity-80" aria-hidden="true" />,
                onAction: () => onThemeSettingsOpenChange(true),
              })}
              {isFullscreenSupported && renderMobileMenuItem({
                label: isFullscreen ? "退出全屏" : "全屏",
                pressed: isFullscreen,
                icon: isFullscreen ? (
                  <Minimize className="h-4 w-4 opacity-80" aria-hidden="true" />
                ) : (
                  <Maximize className="h-4 w-4 opacity-80" aria-hidden="true" />
                ),
                onAction: onToggleFullscreen,
              })}
              {onOpenShortcuts && renderMobileMenuItem({
                label: "快捷键",
                icon: <KeyboardIcon className="h-4 w-4 opacity-80" aria-hidden="true" />,
                onAction: onOpenShortcuts,
              })}
            </div>
          </div>

          <div
            data-reader-toolbar-actions="desktop"
            className="hidden items-center gap-0.5 lg:flex"
          >
            {renderDesktopButton({
              title: "目录",
              srLabel: "目录",
              expanded: tocOpen,
              hasPopup: "dialog",
              onClick: () => onTocOpenChange(!tocOpen),
              children: <List className="size-4" strokeWidth={1.5} aria-hidden="true" />,
            })}

            {onOpenSearch && renderDesktopButton({
              title: "书内搜索 (Ctrl/⌘+F)",
              ariaLabel: "书内搜索",
              expanded: searchOpen,
              hasPopup: "dialog",
              onClick: onOpenSearch,
              children: <Search className="size-4" strokeWidth={1.5} aria-hidden="true" />,
            })}

            {showBookmarks && (
              <>
                {renderDesktopButton({
                  title: "书签",
                  srLabel: "书签",
                  expanded: bookmarksOpen,
                  hasPopup: "dialog",
                  className: "relative",
                  onClick: () => onBookmarksOpenChange(!bookmarksOpen),
                  children: (
                    <>
                      <BookmarkIcon className="size-4" strokeWidth={1.5} aria-hidden="true" />
                      {bookmarkCount > 0 && (
                        <span
                          aria-hidden="true"
                          data-bookmark-count={bookmarkCount}
                          className="pointer-events-none absolute -right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 font-mono text-[9px] font-semibold leading-none tabular-nums"
                          style={{
                            background: "var(--reader-chrome-accent)",
                            color: "var(--reader-chrome-bg)",
                          }}
                        >
                          {bookmarkCount > 99 ? "99+" : bookmarkCount}
                        </span>
                      )}
                    </>
                  ),
                })}
                {renderDesktopButton({
                  title: canCreateBookmark ? "添加当前位置为书签" : "当前位置尚未就绪",
                  srLabel: isSavingBookmark ? "添加中..." : "添加",
                  disabled: !canCreateBookmark || isSavingBookmark,
                  busy: isSavingBookmark,
                  dataBookmarked: isCurrentBookmarked,
                  onClick: onCreateBookmark,
                  children: isSavingBookmark ? (
                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
                  ) : (
                    <BookmarkPlus
                      className="size-4"
                      strokeWidth={1.5}
                      aria-hidden="true"
                      style={isCurrentBookmarked ? { color: "var(--reader-chrome-accent)" } : undefined}
                    />
                  ),
                })}
              </>
            )}

            {onSaveOffline && renderDesktopButton({
              title: "保存到此设备，退出登录后会自动清除",
              disabled: isSavingOffline,
              busy: isSavingOffline,
              className: isSavingOffline ? "reader-chrome-btn-expanded" : undefined,
              labelClassName: "flex items-center justify-center gap-1.5",
              onClick: onSaveOffline,
              children: (
                <>
                  {isSavingOffline ? (
                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
                  ) : (
                    <Download className="size-4" strokeWidth={1.5} aria-hidden="true" />
                  )}
                  <span className={isSavingOffline ? "text-[11px]" : "sr-only"}>
                    {isSavingOffline ? offlineDownloadLabel ?? "保存中..." : "离线"}
                  </span>
                </>
              ),
            })}

            {ttsControls}

            <span
              aria-hidden="true"
              className="reader-toolbar-divider mx-1 h-3.5 w-px shrink-0"
            />

            {onPresetChange && (
              <div
                role="group"
                aria-label="快捷切换纸面"
                className="reader-preset-dock mx-0.5 inline-flex"
              >
                {QUICK_PRESETS.map((preset) => {
                  const style = PRESET_STYLES[preset.key];
                  const isActive = activePreset === preset.key;
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => onPresetChange(preset.key)}
                      aria-pressed={isActive}
                      aria-label={`切换为${preset.label}纸面`}
                      title={`${preset.label}纸面`}
                      className="reader-preset-dot"
                      style={{
                        backgroundColor: style.bg,
                        borderColor: withOpacity(style.fg, 0.28),
                      }}
                    />
                  );
                })}
              </div>
            )}

            {typeof fontSize === "number" && onFontSizeChange && (
              <div
                role="group"
                aria-label="快捷调节字号"
                className="reader-font-stepper mx-0.5 hidden xl:inline-flex"
              >
                <button
                  type="button"
                  disabled={fontSize <= 12}
                  onClick={() => onFontSizeChange(Math.max(12, fontSize - 1))}
                  aria-label="减小字号"
                  title="减小字号"
                  className="reader-font-stepper-btn text-[11px] font-semibold"
                >
                  A-
                </button>
                <span
                  aria-live="off"
                  className="min-w-6 text-center font-mono text-[11px] tabular-nums"
                  style={{ color: "var(--reader-chrome-ink)" }}
                >
                  {fontSize}
                </span>
                <button
                  type="button"
                  disabled={fontSize >= 32}
                  onClick={() => onFontSizeChange(Math.min(32, fontSize + 1))}
                  aria-label="增大字号"
                  title="增大字号"
                  className="reader-font-stepper-btn text-[11px] font-semibold"
                >
                  A+
                </button>
              </div>
            )}

            {isFullscreenSupported && renderDesktopButton({
              title: isFullscreen ? "退出全屏" : "全屏阅读",
              srLabel: isFullscreen ? "退出全屏" : "全屏",
              pressed: isFullscreen,
              onClick: onToggleFullscreen,
              children: isFullscreen ? (
                <Minimize className="size-4" strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <Maximize className="size-4" strokeWidth={1.5} aria-hidden="true" />
              ),
            })}

            {renderDesktopButton({
              title: "阅读设置",
              srLabel: "设置",
              expanded: themeSettingsOpen,
              hasPopup: "dialog",
              onClick: () => onThemeSettingsOpenChange(!themeSettingsOpen),
              children: <Settings className="size-4" strokeWidth={1.5} aria-hidden="true" />,
            })}

            {onOpenShortcuts && renderDesktopButton({
              title: "快捷键 (?)",
              ariaLabel: "快捷键",
              onClick: onOpenShortcuts,
              children: <KeyboardIcon className="size-4" strokeWidth={1.5} aria-hidden="true" />,
            })}
          </div>
        </div>
      </div>
    </header>
  );
}
