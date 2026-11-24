"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { ActionIcon, Button, Drawer } from "@mantine/core";
import { List, LocateFixed, Search, X } from "lucide-react";

import type { ThemeColors } from "@/hooks/useReaderTheme";
import type { TOCItem } from "@/lib/types";
import {
  getModernReaderSurface,
  getReaderPanelThemeVars,
} from "@/lib/reader-ui";
import { MemoizedReaderTOCNode } from "@/components/reader/ReaderTOCNode";

const TOC_FILTER_THRESHOLD = 10;

function countTOCItems(items: TOCItem[]): number {
  let count = 0;
  for (const item of items) {
    count += 1;
    if (item.subitems && item.subitems.length > 0) {
      count += countTOCItems(item.subitems);
    }
  }
  return count;
}

function filterTOCItems(items: TOCItem[], query: string): TOCItem[] {
  const result: TOCItem[] = [];
  for (const item of items) {
    if (item.label.toLowerCase().includes(query)) {
      result.push(item);
      continue;
    }
    if (item.subitems && item.subitems.length > 0) {
      const matchedChildren = filterTOCItems(item.subitems, query);
      if (matchedChildren.length > 0) {
        result.push({ ...item, subitems: matchedChildren });
      }
    }
  }
  return result;
}

interface ReaderTOCSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toc: TOCItem[];
  bookTitle: string;
  bookAuthor: string;
  tocListRef: RefObject<HTMLDivElement | null>;
  currentChapter: string;
  currentChapterHref: string;
  uiScheme: ThemeColors;
  overlayContainer?: HTMLElement | null;
  triggerClassName: string;
  triggerStyle: CSSProperties;
  onLocateCurrent: () => void;
  onGoTo: (href: string) => void;
  trigger?: React.ReactNode;
}

export function ReaderTOCSheet({
  open,
  onOpenChange,
  toc,
  bookTitle,
  bookAuthor,
  tocListRef,
  currentChapter,
  currentChapterHref,
  uiScheme,
  overlayContainer,
  triggerClassName,
  triggerStyle,
  onLocateCurrent,
  onGoTo,
  trigger,
}: ReaderTOCSheetProps) {
  const surface = getModernReaderSurface(uiScheme);
  const panelThemeVars = getReaderPanelThemeVars(uiScheme);
  const [searchQuery, setSearchQuery] = useState("");
  const [prevOpen, setPrevOpen] = useState(open);
  const pendingLocateFrameRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open && searchQuery) {
      setSearchQuery("");
    }
  }

  useEffect(() => {
    return () => {
      if (pendingLocateFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingLocateFrameRef.current);
      }
    };
  }, []);

  const totalCount = useMemo(() => countTOCItems(toc), [toc]);
  const showFilter = totalCount > TOC_FILTER_THRESHOLD;
  const normalizedQuery = showFilter ? searchQuery.trim().toLowerCase() : "";
  const visibleTOC = useMemo(
    () => (normalizedQuery ? filterTOCItems(toc, normalizedQuery) : toc),
    [toc, normalizedQuery],
  );
  const visibleCount = useMemo(
    () => (normalizedQuery ? countTOCItems(visibleTOC) : totalCount),
    [normalizedQuery, visibleTOC, totalCount],
  );
  const hasCurrentChapter = Boolean(currentChapter || currentChapterHref);
  const locateLabel = currentChapter
    ? `定位到当前章节：${currentChapter}`
    : hasCurrentChapter
      ? "定位到当前章节"
      : "暂未识别当前章节";

  function handleClose() {
    if (pendingLocateFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingLocateFrameRef.current);
      pendingLocateFrameRef.current = null;
    }
    setSearchQuery("");
    onOpenChange(false);
  }

  function handleClearSearch() {
    setSearchQuery("");
    searchInputRef.current?.focus();
  }

  function handleTOCListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      visibleTOC.length === 0 ||
      (event.key !== "ArrowDown" &&
        event.key !== "ArrowUp" &&
        event.key !== "Home" &&
        event.key !== "End")
    ) {
      return;
    }

    const items = Array.from(
      tocListRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
    );
    if (items.length === 0) return;

    const activeIndex = items.findIndex((item) => item === document.activeElement);
    if (activeIndex === -1) return;

    event.preventDefault();

    if (event.key === "Home") {
      items[0]?.focus();
      return;
    }

    if (event.key === "End") {
      items[items.length - 1]?.focus();
      return;
    }

    if (event.key === "ArrowUp" && activeIndex === 0 && showFilter && searchInputRef.current) {
      searchInputRef.current.focus();
      return;
    }

    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (activeIndex + delta + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  function handleLocateCurrent() {
    if (searchQuery) {
      setSearchQuery("");
      if (pendingLocateFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingLocateFrameRef.current);
      }
      pendingLocateFrameRef.current = window.requestAnimationFrame(() => {
        pendingLocateFrameRef.current = null;
        onLocateCurrent();
      });
      return;
    }
    onLocateCurrent();
  }

  return (
    <>
      <Button
        type="button"
        variant="subtle"
        title="目录"
        aria-label={trigger ? undefined : "目录"}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={triggerClassName}
        style={triggerStyle}
        onClick={() => onOpenChange(!open)}
      >
        {trigger || <List className="h-4 w-4" aria-hidden="true" />}
      </Button>

      <Drawer.Root
        opened={open}
        onClose={handleClose}
        position="bottom"
        size="auto"
        padding={0}
        zIndex={90}
        returnFocus={false}
        closeOnEscape={!searchQuery}
        portalProps={{ target: overlayContainer ?? undefined }}
        classNames={{
          inner:
            "items-end justify-center pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))] sm:pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]",
          content:
            "reader-panel flex max-h-[min(42rem,calc(100svh-1.5rem))] w-full flex-col overflow-hidden rounded-2xl border p-0 sm:max-h-[min(78svh,42rem)] sm:w-[560px] sm:max-w-[calc(100vw-2rem)]",
        }}
        styles={{
          content: {
            ...panelThemeVars,
            flex: "0 1 auto",
            height: "auto",
            background: uiScheme.cardBg,
            borderColor: surface.border,
            color: surface.fg,
            boxShadow: "var(--paper-shadow-floating)",
          },
        }}
      >
        <Drawer.Overlay backgroundOpacity={0.42} blur={3} />
        <Drawer.Content data-reader-interactive="true">
          <div
            className="flex min-h-0 flex-1 flex-col"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !event.nativeEvent.isComposing && searchQuery) {
                event.preventDefault();
                event.stopPropagation();
                setSearchQuery("");
              }
            }}
          >
          <div className="reader-panel-header shrink-0 bg-transparent px-4 py-3.5 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <Drawer.Title
                    className="font-heading text-lg font-medium leading-tight"
                    style={{ color: surface.fg }}
                  >
                    目录
                  </Drawer.Title>
                  {totalCount > 0 ? (
                    <span
                      className="text-xs font-medium tabular-nums"
                      style={{ color: surface.muted }}
                      aria-live="polite"
                    >
                      {normalizedQuery
                        ? `${visibleCount} / ${totalCount}`
                        : totalCount}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 space-y-0.5">
                  <p
                    className="truncate text-xs leading-5"
                    style={{ color: surface.muted }}
                    title={bookTitle || "当前书籍"}
                  >
                    {bookTitle || "当前书籍"}
                  </p>
                  {bookAuthor ? (
                    <p
                      className="truncate text-[11px]"
                      style={{ color: surface.muted }}
                      title={bookAuthor}
                    >
                      {bookAuthor}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <ActionIcon
                  variant="subtle"
                  size={44}
                  radius="md"
                  onClick={handleLocateCurrent}
                  disabled={!hasCurrentChapter}
                  title={locateLabel}
                  aria-label={locateLabel}
                  className="reader-panel-icon"
                >
                  <LocateFixed className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  size={44}
                  radius="md"
                  onClick={handleClose}
                  title="关闭目录"
                  aria-label="关闭目录"
                  className="reader-panel-icon"
                >
                  <X className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
                </ActionIcon>
              </div>
            </div>

            {showFilter ? (
              <div className="reader-panel-search mt-3">
                <Search
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: surface.muted }}
                  aria-hidden="true"
                />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown" && !event.nativeEvent.isComposing) {
                      const firstItem =
                        tocListRef.current?.querySelector<HTMLButtonElement>(
                          "button:not(:disabled)",
                        );
                      if (firstItem) {
                        event.preventDefault();
                        firstItem.focus();
                      }
                    }
                  }}
                  placeholder="搜索章节"
                  aria-label="筛选目录章节"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    aria-label="清空章节搜索"
                    title="清空"
                    className="reader-panel-icon !size-7"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="reader-panel-body custom-scrollbar px-3 py-2 sm:px-5">
            <div
              ref={tocListRef}
              onKeyDown={handleTOCListKeyDown}
              className="space-y-0.5 pb-2"
            >
              {visibleTOC.length > 0 ? (
                visibleTOC.map((item, idx) => (
                  <MemoizedReaderTOCNode
                    key={`${item.href}-${item.label}-${idx}`}
                    item={item}
                    onGoTo={(href) => {
                      onGoTo(href);
                      handleClose();
                    }}
                    currentChapter={currentChapter}
                    currentChapterHref={currentChapterHref}
                    searchQuery={normalizedQuery}
                    uiScheme={uiScheme}
                  />
                ))
              ) : normalizedQuery ? (
                <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                  <div
                    className="mb-3 flex size-10 items-center justify-center rounded-xl border"
                    style={{
                      borderColor: surface.hairline,
                      background: "color-mix(in srgb, var(--reader-panel-hover) 62%, transparent)",
                      color: surface.muted,
                    }}
                  >
                    <Search className="h-4.5 w-4.5" strokeWidth={1.6} aria-hidden="true" />
                  </div>
                  <p
                    className="text-sm font-medium tracking-tight"
                    style={{ color: surface.fg }}
                  >
                    未找到匹配章节
                  </p>
                  <p
                    className="mt-1 text-xs leading-5"
                    style={{ color: surface.muted }}
                  >
                    试试其他关键词，或清空筛选查看全部目录
                  </p>
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="reader-panel-action mt-4 px-3.5 text-xs"
                  >
                    清空筛选
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                  <div
                    className="mb-3 flex size-10 items-center justify-center rounded-xl border"
                    style={{
                      borderColor: surface.hairline,
                      background: "color-mix(in srgb, var(--reader-panel-hover) 62%, transparent)",
                      color: surface.fg,
                    }}
                  >
                    <List className="h-4.5 w-4.5" strokeWidth={1.6} aria-hidden="true" />
                  </div>
                  <p
                    className="text-sm font-medium tracking-tight"
                    style={{ color: surface.fg }}
                  >
                    未检测到目录结构
                  </p>
                  <p
                    className="mt-1.5 max-w-[16rem] text-xs leading-5"
                    style={{ color: surface.muted }}
                  >
                    该书籍可能没有定义标准目录，仍可通过翻页阅读
                  </p>
                </div>
              )}
            </div>
          </div>
          </div>
        </Drawer.Content>
      </Drawer.Root>
    </>
  );
}
