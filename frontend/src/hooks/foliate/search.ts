import type {
  BookSearchCallbacks,
  BookSearchExcerpt,
  BookSearchOutcome,
  BookSearchResultItem,
  FoliateRawSearchExcerpt,
  SearchableFoliateView,
} from "./types";

export const MAX_BOOK_SEARCH_RESULTS = 500;

export function normalizeSearchExcerpt(
  excerpt: string | FoliateRawSearchExcerpt | undefined,
  fallbackQuery: string,
): BookSearchExcerpt {
  if (excerpt && typeof excerpt === "object") {
    return {
      pre: typeof excerpt.pre === "string" ? excerpt.pre : "",
      match: typeof excerpt.match === "string" ? excerpt.match : "",
      post: typeof excerpt.post === "string" ? excerpt.post : "",
    };
  }

  if (typeof excerpt === "string") {
    if (fallbackQuery) {
      const idx = excerpt.toLowerCase().indexOf(fallbackQuery.toLowerCase());
      if (idx !== -1) {
        return {
          pre: excerpt.slice(0, idx),
          match: excerpt.slice(idx, idx + fallbackQuery.length),
          post: excerpt.slice(idx + fallbackQuery.length),
        };
      }
    }
    return { pre: excerpt, match: "", post: "" };
  }

  return { pre: "", match: fallbackQuery, post: "" };
}

export function clearFoliateSearch(view: SearchableFoliateView | null): void {
  if (!view || typeof view.clearSearch !== "function") return;
  try {
    view.clearSearch();
  } catch (err) {
    console.error("Failed to clear search highlights:", err);
  }
}

export async function searchFoliateView(
  view: SearchableFoliateView | null,
  query: string,
  callbacks?: BookSearchCallbacks,
  signal?: AbortSignal,
): Promise<BookSearchOutcome> {
  if (!view || typeof view.search !== "function") {
    return { total: 0, supported: false, truncated: false };
  }

  const sections = view.book?.sections;
  if (
    Array.isArray(sections) &&
    sections.length > 0 &&
    !sections.some((section) => typeof section?.createDocument === "function")
  ) {
    return { total: 0, supported: false, truncated: false };
  }

  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    clearFoliateSearch(view);
    return { total: 0, supported: true, truncated: false };
  }

  if (signal?.aborted) {
    return { total: 0, supported: true, truncated: false };
  }

  const iterable = view.search({ query: trimmedQuery });
  if (!iterable || typeof iterable[Symbol.asyncIterator] !== "function") {
    return { total: 0, supported: false, truncated: false };
  }

  const iterator = iterable[Symbol.asyncIterator]();
  let total = 0;
  let truncated = false;
  let closed = false;

  const closeIterator = () => {
    if (closed) return;
    closed = true;
    try {
      void iterator.return?.();
    } catch {
      // Ignore cleanup errors when closing an aborted/truncated search generator.
    }
  };

  const handleAbort = () => {
    closeIterator();
  };

  signal?.addEventListener("abort", handleAbort, { once: true });

  try {
    while (true) {
      if (signal?.aborted) {
        closeIterator();
        break;
      }

      const step = await iterator.next();
      if (step.done) break;

      if (signal?.aborted) {
        closeIterator();
        break;
      }

      const item = step.value;
      if (item === "done") break;
      if (!item || typeof item !== "object") continue;

      if ("progress" in item && typeof item.progress === "number") {
        const clampedProgress = Number.isFinite(item.progress)
          ? Math.max(0, Math.min(1, item.progress))
          : 0;
        callbacks?.onProgress?.(clampedProgress);
        continue;
      }

      const batch: BookSearchResultItem[] = [];
      if ("subitems" in item && Array.isArray(item.subitems)) {
        const sectionLabel = typeof item.label === "string" ? item.label : "";
        for (const subitem of item.subitems) {
          if (!subitem?.cfi) continue;
          batch.push({
            cfi: subitem.cfi,
            excerpt: normalizeSearchExcerpt(subitem.excerpt, trimmedQuery),
            sectionLabel,
          });
        }
      } else if ("cfi" in item && typeof item.cfi === "string" && item.cfi) {
        batch.push({
          cfi: item.cfi,
          excerpt: normalizeSearchExcerpt(item.excerpt, trimmedQuery),
          sectionLabel: "",
        });
      }

      if (batch.length === 0) continue;

      const remaining = MAX_BOOK_SEARCH_RESULTS - total;
      if (remaining <= 0) {
        truncated = true;
        closeIterator();
        break;
      }

      const accepted =
        batch.length > remaining ? batch.slice(0, remaining) : batch;
      total += accepted.length;
      callbacks?.onResults?.(accepted);

      if (batch.length > remaining) {
        truncated = true;
        closeIterator();
        break;
      }
    }
  } catch (err) {
    if (!signal?.aborted) {
      throw err;
    }
  } finally {
    signal?.removeEventListener("abort", handleAbort);
  }

  return { total, supported: true, truncated };
}
