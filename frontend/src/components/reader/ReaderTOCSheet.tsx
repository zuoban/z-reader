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
import { ActionIcon } from "@mantine/core";
import { ChevronLeft, ChevronRight, List, LocateFixed, Search, Undo2, X } from "lucide-react";

import type { ThemeColors } from "@/hooks/useReaderTheme";
import type { TOCItem } from "@/lib/types";
import { getModernReaderSurface, handleRovingListKeyDown } from "@/lib/reader-ui";
import { ReaderEmptyState, ReaderSheet } from "@/components/reader/ReaderSheet";
import { MemoizedReaderTOCNode } from "@/components/reader/ReaderTOCNode";

const TOC_FILTER_THRESHOLD = 10;
const PROGRESS_MILESTONES = [0, 25, 50, 75, 100] as const;

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

function flattenTOCItems(items: TOCItem[]): TOCItem[] {
  const flat: TOCItem[] = [];
  for (const item of items) {
    if (item.href) {
      flat.push(item);
    }
    if (item.subitems && item.subitems.length > 0) {
      flat.push(...flattenTOCItems(item.subitems));
    }
  }
  return flat;
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
  onLocateCurrent: () => void;
  onGoTo: (href: string) => void;
  percentage?: number;
  onGoToFraction?: (fraction: number) => void;
  jumpBackPercentage?: number | null;
  onReturnToPreviousLocation?: () => void;
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
  onLocateCurrent,
  onGoTo,
  percentage = 0,
  onGoToFraction,
  jumpBackPercentage = null,
  onReturnToPreviousLocation,
}: ReaderTOCSheetProps) {
  const surface = getModernReaderSurface(uiScheme);
  const [searchQuery, setSearchQuery] = useState("");
  const [draftPercentage, setDraftPercentage] = useState<number | null>(null);
  const [prevOpen, setPrevOpen] = useState(open);
  const pendingLocateFrameRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isDraggingRef = useRef(false);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      if (searchQuery) {
        setSearchQuery("");
      }
      if (draftPercentage !== null) {
        setDraftPercentage(null);
      }
    }
  }

  useEffect(() => {
    if (!open) {
      isDraggingRef.current = false;
    }
  }, [open]);

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
  const flatTOC = useMemo(() => flattenTOCItems(toc), [toc]);
  const currentChapterIndex = useMemo(() => {
    if (currentChapterHref) {
      return flatTOC.findIndex((item) => item.href === currentChapterHref);
    }
    if (currentChapter) {
      return flatTOC.findIndex((item) => item.label === currentChapter);
    }
    return -1;
  }, [currentChapter, currentChapterHref, flatTOC]);
  const prevChapter =
    currentChapterIndex > 0 ? flatTOC[currentChapterIndex - 1] : null;
  const nextChapter =
    currentChapterIndex >= 0 && currentChapterIndex < flatTOC.length - 1
      ? flatTOC[currentChapterIndex + 1]
      : null;
  const hasCurrentChapter = Boolean(currentChapter || currentChapterHref);
  const locateLabel = currentChapter
    ? `定位到当前章节：${currentChapter}`
    : hasCurrentChapter
      ? "定位到当前章节"
      : "暂未识别当前章节";

  const clampedPercentage = Number.isFinite(percentage)
    ? Math.min(100, Math.max(0, percentage))
    : 0;
  const displayPercentage = draftPercentage ?? clampedPercentage;
  const hasJumpBackPercentage =
    jumpBackPercentage !== null &&
    jumpBackPercentage !== undefined &&
    Number.isFinite(jumpBackPercentage);

  function handleClose() {
    if (pendingLocateFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingLocateFrameRef.current);
      pendingLocateFrameRef.current = null;
    }
    isDraggingRef.current = false;
    setDraftPercentage(null);
    setSearchQuery("");
    onOpenChange(false);
  }

  function handleScrubPointerDown() {
    isDraggingRef.current = true;
  }

  function handleScrubChange(value: number) {
    if (!Number.isFinite(value)) return;
    const clamped = Math.min(100, Math.max(0, value));
    if (isDraggingRef.current) {
      setDraftPercentage(clamped);
      return;
    }
    setDraftPercentage(null);
    onGoToFraction?.(clamped / 100);
  }

  function commitScrub() {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    if (draftPercentage !== null) {
      const target = draftPercentage;
      setDraftPercentage(null);
      onGoToFraction?.(target / 100);
    }
  }

  function handleReturnToPrevious() {
    isDraggingRef.current = false;
    setDraftPercentage(null);
    onReturnToPreviousLocation?.();
  }

  function handleClearSearch() {
    setSearchQuery("");
    searchInputRef.current?.focus();
  }

  function handleTOCListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (visibleTOC.length === 0) return;
    handleRovingListKeyDown(event, tocListRef.current, {
      requireActiveItem: true,
      onArrowUpFromFirst: showFilter ? () => searchInputRef.current?.focus() : undefined,
    });
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
    <ReaderSheet
      open={open}
      onClose={handleClose}
      closeOnEscape={!searchQuery}
      guardComposingEscape
      widthClassName="sm:w-[560px]"
      uiScheme={uiScheme}
      overlayContainer={overlayContainer}
      closeLabel="关闭目录"
      title="目录"
      titleAddon={
        totalCount > 0 ? (
          <span
            className="text-xs font-medium tabular-nums"
            style={{ color: surface.muted }}
            aria-live="polite"
          >
            {normalizedQuery ? `${visibleCount} / ${totalCount}` : totalCount}
          </span>
        ) : null
      }
      subtitle={
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
      }
      headerActions={
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
      }
      headerExtra={
        showFilter ? (
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
        ) : null
      }
      onContentKeyDown={(event) => {
        if (event.key === "Escape" && !event.nativeEvent.isComposing && searchQuery) {
          event.preventDefault();
          event.stopPropagation();
          handleClearSearch();
        }
      }}
    >
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
            <ReaderEmptyState
              icon={<Search className="h-4.5 w-4.5" strokeWidth={1.6} aria-hidden="true" />}
              iconTone="muted"
              title="未找到匹配章节"
              description="试试其他关键词，或清空筛选查看全部目录"
              uiScheme={uiScheme}
              action={
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="reader-panel-action mt-4 px-3.5 text-xs"
                >
                  清空筛选
                </button>
              }
            />
          ) : (
            <ReaderEmptyState
              icon={<List className="h-4.5 w-4.5" strokeWidth={1.6} aria-hidden="true" />}
              paddingClassName="py-16"
              title="未检测到目录结构"
              description="该书籍可能没有定义标准目录，仍可通过翻页阅读"
              uiScheme={uiScheme}
            />
          )}
        </div>
      </div>

      {(prevChapter || nextChapter || onGoToFraction) ? (
        <div
          className="shrink-0 border-t px-4 py-3 sm:px-6"
          style={{
            borderColor: surface.hairline,
            background: uiScheme.cardBg,
          }}
        >
          {(prevChapter || nextChapter) ? (
            <div
              className={onGoToFraction ? "mb-3 grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-2"}
            >
              <button
                type="button"
                disabled={!prevChapter}
                onClick={() => {
                  if (!prevChapter) return;
                  onGoTo(prevChapter.href);
                  handleClose();
                }}
                aria-label={prevChapter ? `上一章：${prevChapter.label}` : "已是第一章"}
                title={prevChapter ? `上一章：${prevChapter.label}` : "已是第一章"}
                className="reader-panel-secondary !h-9 min-w-0 justify-start gap-1.5 px-2.5 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5 shrink-0" strokeWidth={1.7} aria-hidden="true" />
                <span className="min-w-0 truncate">
                  {prevChapter ? prevChapter.label : "已是第一章"}
                </span>
              </button>
              <button
                type="button"
                disabled={!nextChapter}
                onClick={() => {
                  if (!nextChapter) return;
                  onGoTo(nextChapter.href);
                  handleClose();
                }}
                aria-label={nextChapter ? `下一章：${nextChapter.label}` : "已是最后一章"}
                title={nextChapter ? `下一章：${nextChapter.label}` : "已是最后一章"}
                className="reader-panel-secondary !h-9 min-w-0 justify-end gap-1.5 px-2.5 text-xs"
              >
                <span className="min-w-0 truncate">
                  {nextChapter ? nextChapter.label : "已是最后一章"}
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0" strokeWidth={1.7} aria-hidden="true" />
              </button>
            </div>
          ) : null}

          {onGoToFraction ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-xs font-medium"
                    style={{ color: surface.muted }}
                  >
                    阅读进度
                  </span>
                  <span
                    className="font-mono text-xs font-medium tabular-nums"
                    style={{ color: surface.fg }}
                  >
                    {displayPercentage.toFixed(1)}%
                  </span>
                  {currentChapterIndex >= 0 && flatTOC.length > 0 ? (
                    <span
                      data-toc-chapter-position={`${currentChapterIndex + 1}/${flatTOC.length}`}
                      className="font-mono text-[11px] tabular-nums"
                      style={{ color: surface.muted }}
                    >
                      第 {currentChapterIndex + 1} / {flatTOC.length} 章
                    </span>
                  ) : null}
                </div>

                {onReturnToPreviousLocation ? (
                  <button
                    type="button"
                    onClick={handleReturnToPrevious}
                    title={
                      hasJumpBackPercentage
                        ? `返回跳转前位置 (${jumpBackPercentage.toFixed(1)}%)`
                        : "返回跳转前位置"
                    }
                    aria-label={
                      hasJumpBackPercentage
                        ? `返回原位（跳转前 ${jumpBackPercentage.toFixed(1)}%）`
                        : "返回原位"
                    }
                    className="reader-panel-action !h-7 !px-2.5 !text-xs"
                  >
                    <Undo2
                      className="h-3.5 w-3.5 shrink-0"
                      strokeWidth={1.7}
                      aria-hidden="true"
                    />
                    <span>返回原位</span>
                  </button>
                ) : null}
              </div>

              <div className="mt-1.5 flex min-h-8 items-center">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={0.5}
                  value={displayPercentage}
                  aria-label="跳转阅读进度"
                  aria-valuetext={`${displayPercentage.toFixed(1)}%`}
                  onPointerDown={handleScrubPointerDown}
                  onChange={(event) =>
                    handleScrubChange(Number(event.currentTarget.value))
                  }
                  onPointerUp={commitScrub}
                  onPointerCancel={commitScrub}
                  onTouchEnd={commitScrub}
                  onBlur={commitScrub}
                  className="reader-range-scrubber w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4"
                  style={
                    {
                      "--scrub-progress": `${displayPercentage}%`,
                      outlineColor: uiScheme.link,
                    } as CSSProperties
                  }
                />
              </div>

              <div
                role="group"
                aria-label="快捷进度跳转"
                className="mt-1 flex items-center justify-between gap-1"
              >
                {PROGRESS_MILESTONES.map((mark) => {
                  const isNear = Math.abs(displayPercentage - mark) < 1.5;
                  return (
                    <button
                      key={mark}
                      type="button"
                      onClick={() => {
                        setDraftPercentage(null);
                        onGoToFraction(mark / 100);
                      }}
                      aria-label={`跳转到 ${mark}%`}
                      className="cursor-pointer rounded px-1.5 py-0.5 font-mono text-[11px] tabular-nums transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{
                        color: isNear ? uiScheme.link : surface.muted,
                        fontWeight: isNear ? 600 : 400,
                        outlineColor: uiScheme.link,
                      }}
                    >
                      {mark}%
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </ReaderSheet>
  );
}
