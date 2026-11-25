import { getOfflineLibrary } from "@/lib/library-access";
import { formatDownloadBytes } from "@/lib/reader-page";
import type { FoliateView } from "@/lib/types";
import { withTimeout } from "./runtime";

export interface BookDownloadProgressInfo {
  downloadedBytes: number;
  totalBytes: number | null;
  percentage: number | null;
  bytesPerSecond?: number | null;
  resumed?: boolean;
}

export function formatBookDownloadMessage({
  downloadedBytes,
  totalBytes,
  percentage,
  bytesPerSecond,
  resumed,
}: BookDownloadProgressInfo): string {
  const percentageLabel =
    percentage === null ? "" : ` ${Math.floor(percentage)}%`;
  const sizeLabel =
    totalBytes === null
      ? formatDownloadBytes(downloadedBytes)
      : `${formatDownloadBytes(downloadedBytes)} / ${formatDownloadBytes(totalBytes)}`;
  const speedLabel =
    bytesPerSecond && bytesPerSecond >= 1024
      ? ` · ${formatDownloadBytes(bytesPerSecond)}/s`
      : "";
  return `${resumed ? "继续下载" : "下载书籍"}${percentageLabel} · ${sizeLabel}${speedLabel}`;
}

export function formatOpenBookError(err: unknown): Error {
  const errorMessage = err instanceof Error ? err.message : "未知错误";
  if (errorMessage.includes("external") || errorMessage.includes("permission")) {
    return new Error("打开书籍失败：请允许访问文件，或尝试使用 Chrome 浏览器");
  }
  return new Error(`打开书籍失败：${errorMessage}`);
}

export function pruneDisconnectedChapterCleanups(
  cleanups: Map<Document, () => void>,
): void {
  for (const [chapter, cleanup] of cleanups) {
    if (!chapter.defaultView?.frameElement?.isConnected) {
      cleanup();
      cleanups.delete(chapter);
    }
  }
}

interface LoadBookFileOptions {
  bookId: string;
  library: string;
  isAuthenticated: boolean;
  signal: AbortSignal;
  onOfflineMetadata: (metadata: { title: string; author: string }) => void;
  onDownloadProgress: (message: string, detail: string) => void;
}

export async function loadBookFile({
  bookId,
  library,
  isAuthenticated,
  signal,
  onOfflineMetadata,
  onDownloadProgress,
}: LoadBookFileOptions): Promise<File | Blob> {
  const cancelled = () => signal.aborted || library !== getOfflineLibrary();
  const checkAccess = () => {
    if (cancelled()) throw new DOMException("已取消加载书籍", "AbortError");
  };
  checkAccess();

  if (!isAuthenticated) {
    const { getOfflineBookEntry } = await import("@/lib/offline-books");
    const entry = await getOfflineBookEntry(library, bookId);
    checkAccess();
    if (!entry) {
      throw new Error("当前处于离线状态，本书尚未保存到离线缓存");
    }
    onOfflineMetadata({
      title: entry.title ?? "",
      author: entry.author ?? "",
    });
    return entry.file;
  }

  const { api } = await import("@/lib/api");
  checkAccess();
  return api.createBookFile(bookId, {
    signal,
    onProgress: (progress) => {
      if (cancelled()) return;
      onDownloadProgress(
        formatBookDownloadMessage(progress),
        "书籍文件与阅读器引擎并行加载中",
      );
    },
  });
}

interface OpenFoliateBookOptions {
  view: FoliateView;
  file: File | Blob;
  signal: AbortSignal;
  isCancelled: () => boolean;
  openingViews: WeakSet<FoliateView>;
}

export async function openFoliateBook({
  view,
  file,
  signal,
  isCancelled,
  openingViews,
}: OpenFoliateBookOptions): Promise<void> {
  try {
    openingViews.add(view);
    const opening = Promise.resolve()
      .then(() => {
        if (!isCancelled()) return view.open?.(file);
      })
      .finally(() => {
        openingViews.delete(view);
        if (signal.aborted) {
          try {
            view.close?.();
          } catch (err) {
            console.error("Failed to cleanup reader view:", err);
          }
        }
      });
    await withTimeout(
      opening,
      30000,
      "打开书籍超时：手机浏览器可能不支持当前解压能力，请尝试刷新或使用 Chrome 浏览器",
      signal,
    );
  } catch (err) {
    if (isCancelled()) return;
    console.error("Failed to open book:", err);
    throw formatOpenBookError(err);
  }
}

interface OpenInitialLocationOptions {
  view: FoliateView;
  savedCFI?: string;
  loadedSections: Set<number>;
  signal: AbortSignal;
  isCancelled: () => boolean;
}

export async function openInitialLocation({
  view,
  savedCFI,
  loadedSections,
  signal,
  isCancelled,
}: OpenInitialLocationOptions): Promise<void> {
  const openLocation = async (target: string | number) => {
    const timeoutMessage = "初始化阅读位置超时";
    try {
      // goTo() can swallow errors or resolve for an index outside the book.
      const resolved = (await withTimeout(
        view.goTo?.(target),
        12000,
        timeoutMessage,
        signal,
      )) as void | { index: number };
      if (typeof target === "number") return loadedSections.has(target);
      return !!resolved && loadedSections.has(resolved.index);
    } catch (err) {
      if (isCancelled()) return false;
      if (err instanceof Error && err.message === timeoutMessage) {
        // Preserve usable content if only the final positioning stalled.
        if (
          typeof target === "number"
            ? loadedSections.has(target)
            : loadedSections.size > 0
        ) {
          return true;
        }
        throw err;
      }
      return false;
    }
  };

  const savedLocationLoaded = savedCFI && (await openLocation(savedCFI));
  if (isCancelled()) return;
  if (!savedLocationLoaded && !(await openLocation(0))) {
    if (isCancelled()) return;
    throw new Error("无法加载书籍的首个章节，请尝试重新打开");
  }
}
