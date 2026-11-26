"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ChevronDown, ChevronUp, Clock, Eraser, Loader2, RotateCw, Search, Square, X } from "lucide-react";

import {
  MAX_BOOK_SEARCH_RESULTS,
  type BookSearchCallbacks,
  type BookSearchOutcome,
  type BookSearchResultItem,
} from "@/hooks/useFoliateView";
import type { ThemeColors } from "@/hooks/useReaderTheme";
import { getModernReaderSurface, handleRovingListKeyDown } from "@/lib/reader-ui";
import { ReaderEmptyState, ReaderSheet } from "@/components/reader/ReaderSheet";

export interface ReaderSearchSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookTitle?: string;
  uiScheme: ThemeColors;
  overlayContainer?: HTMLElement | null;
  onSearch: (
    query: string,
    callbacks?: BookSearchCallbacks,
    signal?: AbortSignal,
  ) => Promise<BookSearchOutcome>;
  onClearSearch: () => void;
  onSelectResult: (cfi: string) => void;
}

interface SearchResultGroup {
  sectionLabel: string;
  items: Array<{ item: BookSearchResultItem; index: number }>;
}

const RECENT_SEARCHES_KEY = "z-reader-book-recent-searches";
const MAX_RECENT_SEARCHES = 5;

function readRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const items: string[] = [];
    for (const entry of parsed) {
      if (typeof entry !== "string") continue;
      const normalized = entry.trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      items.push(normalized);
      if (items.length >= MAX_RECENT_SEARCHES) break;
    }
    return items;
  } catch {
    return [];
  }
}

function writeRecentSearches(items: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage failures in restricted contexts.
  }
}

function groupResultsBySection(
  results: BookSearchResultItem[],
): SearchResultGroup[] {
  const groups: SearchResultGroup[] = [];
  for (let index = 0; index < results.length; index += 1) {
    const item = results[index];
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.sectionLabel === item.sectionLabel) {
      lastGroup.items.push({ item, index });
    } else {
      groups.push({
        sectionLabel: item.sectionLabel,
        items: [{ item, index }],
      });
    }
  }
  return groups;
}

export function ReaderSearchSheet({
  open,
  onOpenChange,
  bookTitle = "",
  uiScheme,
  overlayContainer,
  onSearch,
  onClearSearch,
  onSelectResult,
}: ReaderSearchSheetProps) {
  const surface = getModernReaderSurface(uiScheme);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BookSearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeCfi, setActiveCfi] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>(readRecentSearches);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);

  const abortActiveSearch = useCallback(() => {
    const controller = abortControllerRef.current;
    abortControllerRef.current = null;
    controller?.abort();
  }, []);

  useEffect(() => {
    return () => {
      abortActiveSearch();
    };
  }, [abortActiveSearch]);

  useEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const groupedResults = useMemo(
    () => groupResultsBySection(results),
    [results],
  );

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleStopSearch = useCallback(() => {
    runIdRef.current += 1;
    abortActiveSearch();
    setIsSearching(false);
  }, [abortActiveSearch]);

  const handleClearQuery = useCallback(() => {
    setQuery("");
    inputRef.current?.focus();
  }, []);

  const resetSearchState = useCallback(() => {
    runIdRef.current += 1;
    onClearSearch();
    setIsSearching(false);
    setResults([]);
    setProgress(0);
    setHasSearched(false);
    setTruncated(false);
    setUnsupported(false);
    setSearchError(null);
    setActiveCfi(null);
  }, [onClearSearch]);

  const handleClearHighlights = useCallback(() => {
    abortActiveSearch();
    resetSearchState();
    inputRef.current?.focus();
  }, [abortActiveSearch, resetSearchState]);

  const handleClearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    writeRecentSearches([]);
  }, []);

  const runSearch = useCallback(
    async (rawQuery: string) => {
      const trimmed = rawQuery.trim();
      abortActiveSearch();

      if (!trimmed) {
        resetSearchState();
        return;
      }

      setRecentSearches((prev) => {
        const next = [trimmed, ...prev.filter((item) => item !== trimmed)].slice(
          0,
          MAX_RECENT_SEARCHES,
        );
        writeRecentSearches(next);
        return next;
      });

      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsSearching(true);
      setHasSearched(true);
      setResults([]);
      setProgress(0);
      setTruncated(false);
      setUnsupported(false);
      setSearchError(null);
      setActiveCfi(null);

      try {
        const outcome = await onSearch(
          trimmed,
          {
            onProgress: (value) => {
              if (runId !== runIdRef.current || controller.signal.aborted) {
                return;
              }
              setProgress(value);
            },
            onResults: (batch) => {
              if (runId !== runIdRef.current || controller.signal.aborted) {
                return;
              }
              setResults((prev) => [...prev, ...batch]);
            },
          },
          controller.signal,
        );

        if (runId !== runIdRef.current || controller.signal.aborted) {
          return;
        }

        setUnsupported(!outcome.supported);
        setTruncated(Boolean(outcome.truncated));
        if (outcome.supported) {
          setProgress(1);
        }
      } catch {
        if (runId !== runIdRef.current || controller.signal.aborted) {
          return;
        }
        setSearchError("搜索失败，请稍后重试");
      } finally {
        if (runId === runIdRef.current) {
          if (abortControllerRef.current === controller) {
            abortControllerRef.current = null;
          }
          setIsSearching(false);
        }
      }
    },
    [abortActiveSearch, onSearch, resetSearchState],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runSearch(query);
  }

  function handleListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (results.length === 0) return;
    handleRovingListKeyDown(event, listRef.current, {
      requireActiveItem: true,
      onArrowUpFromFirst: () => inputRef.current?.focus(),
    });
  }

  const progressPercent = Math.round(Math.max(0, Math.min(progress, 1)) * 100);
  const summaryText = truncated
    ? `已显示前 ${results.length || MAX_BOOK_SEARCH_RESULTS} 处匹配`
    : `找到 ${results.length} 处匹配`;
  const activeIndex = activeCfi
    ? results.findIndex((item) => item.cfi === activeCfi)
    : -1;

  const handleStepResult = useCallback(
    (delta: -1 | 1) => {
      if (results.length === 0) return;
      const nextIndex =
        activeIndex === -1
          ? delta > 0
            ? 0
            : results.length - 1
          : (activeIndex + delta + results.length) % results.length;
      const target = results[nextIndex];
      if (!target) return;
      setActiveCfi(target.cfi);
      onSelectResult(target.cfi);
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-search-index="${nextIndex}"]`)
        ?.scrollIntoView?.({ block: "nearest" });
    },
    [activeIndex, onSelectResult, results],
  );

  return (
    <ReaderSheet
      open={open}
      onClose={handleClose}
      closeOnEscape={!query}
      guardComposingEscape
      widthClassName="sm:w-[560px]"
      uiScheme={uiScheme}
      overlayContainer={overlayContainer}
      closeLabel="关闭书内搜索"
      title="书内搜索"
      titleAddon={
        results.length > 0 ? (
          <span
            className="text-xs font-medium tabular-nums"
            style={{ color: surface.muted }}
            aria-live="polite"
          >
            {results.length}
          </span>
        ) : null
      }
      subtitle={
        <p
          className="mt-1 truncate text-xs leading-5"
          style={{ color: surface.muted }}
          title={bookTitle || "当前书籍"}
        >
          {bookTitle || "当前书籍"}
        </p>
      }
      headerExtra={
        <>
          <form
            onSubmit={handleSubmit}
            className="mt-3 flex items-center gap-2"
            role="search"
          >
            <div className="reader-panel-search min-w-0 flex-1">
              <Search
                className="h-4 w-4 shrink-0 opacity-60"
                strokeWidth={1.6}
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                data-autofocus
                type="search"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "ArrowDown" &&
                    !event.nativeEvent.isComposing
                  ) {
                    const firstItem =
                      listRef.current?.querySelector<HTMLButtonElement>(
                        "button:not(:disabled)",
                      );
                    if (firstItem) {
                      event.preventDefault();
                      firstItem.focus();
                    }
                  }
                }}
                placeholder="输入关键词搜索全书"
                aria-label="书内全文搜索"
              />
              {query ? (
                <button
                  type="button"
                  onClick={handleClearQuery}
                  aria-label="清空搜索词"
                  title="清空"
                  className="reader-panel-icon !size-7"
                >
                  <X
                    className="h-3.5 w-3.5"
                    strokeWidth={1.6}
                    aria-hidden="true"
                  />
                </button>
              ) : null}
            </div>

            {isSearching ? (
              <button
                type="button"
                onClick={handleStopSearch}
                className="reader-panel-secondary !h-10 px-3 text-xs lg:!h-9"
              >
                <Square
                  className="h-3.5 w-3.5 shrink-0 fill-current"
                  strokeWidth={1.6}
                  aria-hidden="true"
                />
                <span>停止</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!query.trim()}
                className="reader-panel-action !h-10 px-3 text-xs lg:!h-9"
              >
                <span>搜索</span>
              </button>
            )}
          </form>

          {isSearching && (
            <div className="mt-2.5 space-y-1.5" aria-live="polite">
              <div
                className="flex items-center justify-between text-xs"
                style={{ color: surface.muted }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                    strokeWidth={1.6}
                    aria-hidden="true"
                  />
                  <span>
                    正在搜索…{" "}
                    {results.length > 0 ? `已找到 ${results.length} 处` : ""}
                  </span>
                </span>
                <span className="tabular-nums">{progressPercent}%</span>
              </div>
              <div
                role="progressbar"
                aria-label="搜索进度"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent}
                className="h-1 w-full overflow-hidden rounded-full"
                style={{
                  background:
                    "color-mix(in srgb, var(--reader-panel-hover) 80%, transparent)",
                }}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-150 ease-out"
                  style={{
                    width: `${progressPercent}%`,
                    background: "var(--reader-panel-accent)",
                  }}
                />
              </div>
            </div>
          )}

          {!isSearching && results.length > 0 && (
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="truncate text-xs font-medium tabular-nums"
                  style={{ color: surface.muted }}
                  aria-live="polite"
                >
                  {summaryText}
                </span>
                {activeIndex >= 0 && (
                  <span
                    className="shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[11px] leading-none tabular-nums"
                    style={{
                      background: "color-mix(in srgb, var(--reader-panel-accent) 12%, transparent)",
                      color: uiScheme.link,
                    }}
                  >
                    {activeIndex + 1} / {results.length}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {results.length > 1 && (
                  <div
                    role="group"
                    aria-label="切换匹配结果"
                    className="inline-flex items-center gap-0.5"
                  >
                    <button
                      type="button"
                      onClick={() => handleStepResult(-1)}
                      aria-label="上一处匹配"
                      title="上一处匹配 (Shift+F3)"
                      className="reader-panel-icon !size-7"
                    >
                      <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStepResult(1)}
                      aria-label="下一处匹配"
                      title="下一处匹配 (F3)"
                      className="reader-panel-icon !size-7"
                    >
                      <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleClearHighlights}
                  className="reader-panel-secondary !h-7 px-2.5 text-xs"
                >
                  <Eraser
                    className="h-3.5 w-3.5 shrink-0"
                    strokeWidth={1.6}
                    aria-hidden="true"
                  />
                  <span>清除高亮</span>
                </button>
              </div>
            </div>
          )}
        </>
      }
      onContentKeyDown={(event) => {
        if (
          event.key === "F3" &&
          !event.nativeEvent.isComposing &&
          !isSearching &&
          results.length > 0
        ) {
          event.preventDefault();
          event.stopPropagation();
          handleStepResult(event.shiftKey ? -1 : 1);
          return;
        }
        if (
          event.key === "Escape" &&
          !event.nativeEvent.isComposing &&
          query
        ) {
          event.preventDefault();
          event.stopPropagation();
          handleClearQuery();
        }
      }}
    >
      <div className="reader-panel-body custom-scrollbar px-3 py-2 sm:px-5">
        {results.length > 0 ? (
          <div
            ref={listRef}
            onKeyDown={handleListKeyDown}
            className="space-y-3 pb-3"
          >
            {groupedResults.map((group, groupIndex) => (
              <section
                key={`${group.sectionLabel}-${groupIndex}`}
                className="space-y-1"
              >
                {group.sectionLabel ? (
                  <h3
                    className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium backdrop-blur-md"
                    style={{
                      color: surface.muted,
                      background:
                        "color-mix(in srgb, var(--reader-panel-bg) 90%, transparent)",
                    }}
                    title={group.sectionLabel}
                  >
                    <span className="min-w-0 truncate">{group.sectionLabel}</span>
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] leading-none tabular-nums"
                      style={{
                        background:
                          "color-mix(in srgb, var(--reader-panel-hover) 72%, transparent)",
                      }}
                    >
                      {group.items.length}
                    </span>
                  </h3>
                ) : null}
                <div className="space-y-0.5">
                  {group.items.map(({ item, index }) => {
                    const isActive = activeCfi === item.cfi;
                    const excerptText = `${item.excerpt.pre}${item.excerpt.match}${item.excerpt.post}`;
                    const ariaLabel = item.sectionLabel
                      ? `跳转到 ${item.sectionLabel}：${excerptText}`
                      : `跳转到匹配结果 ${index + 1}：${excerptText}`;

                    return (
                      <button
                        key={`${item.cfi}-${index}`}
                        type="button"
                        data-search-index={index}
                        aria-label={ariaLabel}
                        aria-current={isActive ? "true" : undefined}
                        data-current-chapter={isActive ? "true" : undefined}
                        className="reader-panel-item w-full flex-col items-stretch px-3 py-2"
                        onClick={() => {
                          setActiveCfi(item.cfi);
                          onSelectResult(item.cfi);
                          onOpenChange(false);
                        }}
                      >
                        <p
                          className="text-sm leading-6 break-words"
                          style={{ color: surface.fg }}
                        >
                          {item.excerpt.pre}
                          {item.excerpt.match ? (
                            <mark className="reader-search-mark">
                              {item.excerpt.match}
                            </mark>
                          ) : null}
                          {item.excerpt.post}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : isSearching ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <Loader2
              className="mb-3 h-5 w-5 animate-spin motion-reduce:animate-none"
              style={{ color: surface.muted }}
              strokeWidth={1.6}
              aria-hidden="true"
            />
            <p
              className="text-sm font-medium tracking-tight"
              style={{ color: surface.fg }}
            >
              正在全书范围内搜索…
            </p>
          </div>
        ) : unsupported ? (
          <ReaderEmptyState
            icon={<Search className="h-4.5 w-4.5" strokeWidth={1.6} aria-hidden="true" />}
            iconTone="muted"
            descriptionWidthClassName="max-w-[18rem]"
            title="当前书籍暂不支持全文搜索"
            description="部分扫描版或非文本格式暂无法索引正文内容"
            uiScheme={uiScheme}
          />
        ) : searchError ? (
          <ReaderEmptyState
            icon={<Search className="h-4.5 w-4.5" strokeWidth={1.6} aria-hidden="true" />}
            iconTone="muted"
            title={searchError}
            description="请检查书籍状态或稍后再试"
            uiScheme={uiScheme}
            action={
              <button
                type="button"
                onClick={() => void runSearch(query)}
                className="reader-panel-action mt-4 px-3.5 text-xs"
              >
                <RotateCw className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} aria-hidden="true" />
                <span>重试搜索</span>
              </button>
            }
          />
        ) : hasSearched ? (
          <ReaderEmptyState
            icon={<Search className="h-4.5 w-4.5" strokeWidth={1.6} aria-hidden="true" />}
            iconTone="muted"
            title="未找到匹配内容"
            description="试试更换其他关键词，或缩短搜索词组"
            uiScheme={uiScheme}
          />
        ) : (
          <ReaderEmptyState
            icon={<Search className="h-4.5 w-4.5" strokeWidth={1.6} aria-hidden="true" />}
            descriptionWidthClassName="max-w-[18rem]"
            title="输入关键词在全书范围内搜索"
            description="按回车开始搜索，点击结果即可跳转并高亮正文"
            uiScheme={uiScheme}
            action={
              recentSearches.length > 0 ? (
                <div className="mt-5 w-full max-w-sm space-y-2 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="inline-flex items-center gap-1 text-xs font-medium"
                      style={{ color: surface.muted }}
                    >
                      <Clock className="h-3 w-3 shrink-0" strokeWidth={1.6} aria-hidden="true" />
                      <span>最近搜索</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleClearRecentSearches}
                      aria-label="清空最近搜索"
                      className="cursor-pointer rounded px-1.5 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{ color: surface.muted, outlineColor: uiScheme.link }}
                    >
                      清空记录
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {recentSearches.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => {
                          setQuery(term);
                          void runSearch(term);
                        }}
                        className="reader-settings-option inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-xs"
                        style={{
                          borderColor: surface.hairline,
                          color: surface.fg,
                        }}
                      >
                        <span className="truncate">{term}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : undefined
            }
          />
        )}
      </div>
    </ReaderSheet>
  );
}
