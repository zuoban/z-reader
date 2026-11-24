"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { FoliateView, type TOCItem } from "@/lib/types";
import type { ReaderTheme } from "@/hooks/useReaderTheme";
import { PRESET_STYLES } from "@/hooks/useReaderTheme";
import { getOfflineLibrary } from "@/lib/library-access";
import { formatDownloadBytes } from "@/lib/reader-page";
import foliateAssets from "@/lib/foliate-assets.generated.json";

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function withTimeout<T>(
  promise: Promise<T> | T,
  ms: number,
  message: string,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      window.clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      finish();
      reject(signal.reason);
    };
    const timeoutId = window.setTimeout(() => {
      finish();
      reject(new Error(message));
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    void Promise.resolve(promise).then(resolve, reject).finally(finish);
  });
}

function waitForNonZeroRect(element: HTMLElement, signal: AbortSignal, timeoutMs = 3000): Promise<void> {
  const startedAt = window.performance.now();

  return new Promise((resolve) => {
    const check = () => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        resolve();
        return;
      }
      if (window.performance.now() - startedAt >= timeoutMs) {
        resolve();
        return;
      }
      window.requestAnimationFrame(check);
    };

    check();
  });
}

function normalizeMetadataText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeMetadataText(item))
      .filter(Boolean)
      .join("、");
  }
  if (value && typeof value === "object") {
    const record = value as { name?: unknown; label?: unknown; text?: unknown };
    return (
      normalizeMetadataText(record.name) ||
      normalizeMetadataText(record.label) ||
      normalizeMetadataText(record.text)
    );
  }
  return "";
}

function getReaderCompatibilityError(): string | null {
  if (typeof window === "undefined") return null;

  const missingFeatures = [
    ["自定义组件", "customElements" in window],
    ["iframe 渲染", typeof HTMLIFrameElement !== "undefined"],
    ["Range 定位", typeof Range !== "undefined"],
  ]
    .filter(([, supported]) => !supported)
    .map(([name]) => name);

  if (missingFeatures.length > 0) {
    return `当前浏览器缺少阅读器能力：${missingFeatures.join("、")}。请用 Chrome 浏览器打开。`;
  }

  return null;
}

function shouldUseReaderCompatibilityMode(): boolean {
  if (typeof window === "undefined") return false;

  const userAgent = window.navigator.userAgent;
  const isAndroid = /Android/i.test(userAgent);
  if (!isAndroid) return false;

  const isChrome = /Chrome\/|CriOS\//i.test(userAgent);
  const isEdge = /EdgA?\/|EdgiOS\//i.test(userAgent);
  const isFirefox = /Firefox\/|FxiOS\//i.test(userAgent);
  const isSamsungBrowser = /SamsungBrowser\//i.test(userAgent);
  const isAndroidWebView = /; wv\)|Version\/4\.0/i.test(userAgent);

  return isAndroidWebView || !(isChrome || isEdge || isFirefox || isSamsungBrowser);
}

async function waitForFoliateView() {
  let retries = 0;
  while (!customElements.get("foliate-view") && retries < 50) {
    await sleep(100);
    retries++;
  }
  if (!customElements.get("foliate-view")) {
    // Check if the script was loaded at all
    const script = document.querySelector('script[data-foliate-entry]');
    if (!script) {
      throw new Error("阅读器脚本未加载，请检查网络连接");
    }
    throw new Error("阅读器组件注册失败，请尝试使用 Chrome 浏览器");
  }
}

/** Soft-wait until condition is true or timeout (ms). */
async function waitUntil(predicate: () => boolean, timeoutMs: number) {
  if (predicate()) return;
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    await sleep(32);
    if (predicate()) return;
  }
}

let foliateScriptPromise: Promise<void> | null = null;

/** Load foliate view.js once; safe to call from prefetch + init. */
function ensureFoliateScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("阅读器只能在浏览器中加载"));
  }
  if (customElements.get("foliate-view")) {
    return Promise.resolve();
  }
  if (foliateScriptPromise) return foliateScriptPromise;

  foliateScriptPromise = (async () => {
    // Start the static module graph alongside the entry and compatibility helpers.
    for (const href of foliateAssets.preload) {
      if (document.querySelector(`link[rel="modulepreload"][href="${href}"]`)) continue;
      const preload = document.createElement("link");
      preload.rel = "modulepreload";
      preload.href = href;
      preload.crossOrigin = "anonymous";
      document.head.appendChild(preload);
    }
    const { injectFoliatePolyfills } = await import("@/lib/foliate-polyfills");
    injectFoliatePolyfills();

    const existing = document.querySelector(
      'script[data-foliate-entry]'
    ) as HTMLScriptElement | null;
    if (existing) {
      await waitForFoliateView();
      return;
    }

    const script = document.createElement("script");
    script.src = foliateAssets.entry;
    script.dataset.foliateEntry = "true";
    script.type = "module";
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer-when-downgrade";

    try {
      await new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
          window.clearTimeout(timeout);
          script.onload = null;
          script.onerror = null;
          if (error) reject(error);
          else resolve();
        };
        const timeout = window.setTimeout(() => {
          finish(new Error("加载阅读器脚本超时，请检查网络连接"));
        }, 15000);
        script.onload = () => finish();
        script.onerror = () => finish(new Error("加载阅读器脚本失败，请尝试使用 Chrome 浏览器"));
        document.head.appendChild(script);
      });
      await waitForFoliateView();
    } catch (error) {
      script.remove();
      throw error;
    }
  })().catch((err) => {
    foliateScriptPromise = null;
    throw err;
  });

  return foliateScriptPromise;
}

interface UseFoliateViewOptions {
  bookId: string;
  containerRef: RefObject<HTMLDivElement | null>;
  viewRef: RefObject<FoliateView | null>;
  isAuthenticated: boolean;
  canLoadOffline?: boolean;
  progressLoading: boolean;
  progress: { cfi: string; percentage: number; updated_at?: string; remote?: boolean } | null;
  theme: ReaderTheme;
  getStylesheet: () => string;
  updateProgress: (cfi: string, percentage: number) => void;
  bindReaderDocument: (doc: Document, view?: FoliateView) => void | (() => void);
  onImageOpen?: (image: { src: string; alt: string }) => void;
}

export function useFoliateView({
  bookId,
  containerRef,
  viewRef,
  isAuthenticated,
  canLoadOffline = false,
  progressLoading,
  progress,
  theme,
  getStylesheet,
  updateProgress,
  bindReaderDocument,
  onImageOpen,
}: UseFoliateViewOptions) {
  const canLoad = isAuthenticated || canLoadOffline;
  const [toc, setToc] = useState<TOCItem[]>([]);
  const [bookTitle, setBookTitle] = useState("");
  const [bookAuthor, setBookAuthor] = useState("");
  const [percentage, setPercentage] = useState(progress?.percentage || 0);
  const [currentCFI, setCurrentCFI] = useState(progress?.cfi || "");
  const [currentChapter, setCurrentChapter] = useState("");
  const [currentChapterHref, setCurrentChapterHref] = useState("");
  const [currentPageLabel, setCurrentPageLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [readerReady, setReaderReady] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("准备阅读环境…");
  const [loadingDetail, setLoadingDetail] = useState("正在并行加载引擎与书籍");

  const [library] = useState(getOfflineLibrary);
  const readerControllerRef = useRef<AbortController | null>(null);
  const openingViewsRef = useRef(new WeakSet<FoliateView>());
  const isAuthenticatedRef = useRef(isAuthenticated);
  const fallbackTitleRef = useRef("");
  const fallbackAuthorRef = useRef("");
  const progressRef = useRef(progress);
  const progressLoadingRef = useRef(progressLoading);
  const themeRef = useRef(theme);
  const getStylesheetRef = useRef(getStylesheet);
  const updateProgressRef = useRef(updateProgress);
  const onImageOpenRef = useRef(onImageOpen);
  const appliedRemoteProgressRef = useRef<string | null>(null);
  const chapterCleanupsRef = useRef<Map<Document, () => void>>(new Map());
  const compatibilityModeRef = useRef(false);

  useEffect(() => {
    if (currentCFI || !progress?.cfi) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setCurrentCFI(progress.cfi);
      setPercentage(progress.percentage);
    });
    return () => { cancelled = true; };
  }, [bookId, progress, currentCFI]);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
    progressRef.current = progress;
    progressLoadingRef.current = progressLoading;
    themeRef.current = theme;
    getStylesheetRef.current = getStylesheet;
    updateProgressRef.current = updateProgress;
    onImageOpenRef.current = onImageOpen;
  }, [getStylesheet, isAuthenticated, onImageOpen, progress, progressLoading, theme, updateProgress]);

  const loadBookFile = useCallback(
    async (signal: AbortSignal): Promise<File | Blob> => {
      const cancelled = () => signal.aborted || library !== getOfflineLibrary();
      const checkAccess = () => {
        if (cancelled()) throw new DOMException("已取消加载书籍", "AbortError");
      };
      checkAccess();
      if (!isAuthenticatedRef.current) {
        const { getOfflineBookEntry } = await import("@/lib/offline-books");
        const entry = await getOfflineBookEntry(library, bookId);
        checkAccess();
        if (!entry) {
          throw new Error("当前处于离线状态，本书尚未保存到离线缓存");
        }
        fallbackTitleRef.current = entry.title ?? "";
        fallbackAuthorRef.current = entry.author ?? "";
        if (entry.title) setBookTitle((prev) => prev || entry.title || "");
        if (entry.author) setBookAuthor((prev) => prev || entry.author || "");
        return entry.file;
      }

      const { api } = await import("@/lib/api");
      checkAccess();
      return api.createBookFile(bookId, {
        signal,
        onProgress: ({
          downloadedBytes,
          totalBytes,
          percentage,
          bytesPerSecond,
          resumed,
        }) => {
          if (cancelled()) return;
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
          setLoadingMsg(
            `${resumed ? "继续下载" : "下载书籍"}${percentageLabel} · ${sizeLabel}${speedLabel}`
          );
          setLoadingDetail("书籍文件与阅读器引擎并行加载中");
        },
      });
    },
    [bookId, library]
  );

  const applyRendererPreferences = useCallback((renderer?: FoliateView["renderer"] | null) => {
    if (!renderer) return;
    const currentTheme = themeRef.current;
    const compatibilityMode = compatibilityModeRef.current;
    renderer.setAttribute("margin", "0");
    renderer.setAttribute("flow", compatibilityMode ? "scrolled" : currentTheme.flow);
    renderer.setAttribute("gap", `${compatibilityMode ? 0 : currentTheme.gap}%`);
    renderer.setAttribute(
      "max-inline-size",
      `${compatibilityMode ? 720 : currentTheme.maxInlineSize}px`,
    );
    if (currentTheme.animated && !compatibilityMode) {
      renderer.setAttribute("animated", "");
    } else {
      renderer.removeAttribute("animated");
    }
  }, []);

  const updatePageLabel = useCallback(
    (pageItem?: { label?: string }, location?: { current?: number }) => {
      const renderer = viewRef.current?.renderer;
      const rawPages = renderer?.pages;
      const rawPage = renderer?.page;

      if (
        typeof rawPages === "number" &&
        typeof rawPage === "number" &&
        Number.isFinite(rawPages) &&
        Number.isFinite(rawPage) &&
        rawPages > 2
      ) {
        const totalPages = Math.max(rawPages - 2, 1);
        const currentPage = Math.min(Math.max(rawPage, 1), totalPages);
        setCurrentPageLabel(`${currentPage} / ${totalPages}`);
        return;
      }

      if (pageItem?.label) {
        setCurrentPageLabel(`${pageItem.label}`);
        return;
      }

      if (typeof location?.current === "number") {
        setCurrentPageLabel(`位置 ${location.current}`);
        return;
      }

      setCurrentPageLabel("");
    },
    [viewRef],
  );

  const cleanInlineStyles = useCallback((doc: Document) => {
    const styleID = "z-reader-dark-overrides";
    const styleEl = doc.getElementById(styleID) as HTMLStyleElement | null;

    if (themeRef.current.preset !== "dark") {
      styleEl?.remove();
      return;
    }

    const preset = PRESET_STYLES.dark;
    let darkStyleEl = styleEl;
    if (!darkStyleEl) {
      darkStyleEl = doc.createElement("style");
      darkStyleEl.id = styleID;
      doc.head.appendChild(darkStyleEl);
    }
    darkStyleEl.textContent = `
      * {
        color: ${preset.fg} !important;
      }
      a:link, a:visited {
        color: ${preset.link} !important;
      }
    `;
  }, []);

  const bindImageZoomDocument = useCallback((doc: Document) => {
    const docWindow = doc.defaultView;
    if (!docWindow) return;

    const images = Array.from(
      doc.querySelectorAll<Element>("img, image"),
    );

    images.forEach((image) => {
      image.setAttribute("data-reader-interactive", "true");
      const style = image.getAttribute("style") ?? "";
      image.setAttribute("style", `${style}; cursor: zoom-in;`);
    });

    const getZoomImage = (target: EventTarget | null) => {
      if (!(target instanceof docWindow.Element)) return null;
      const image = target.closest("img, image");
      if (!image) return null;

      const src =
        image instanceof docWindow.HTMLImageElement
          ? image.currentSrc || image.src
          : image.getAttribute("href") ||
            image.getAttribute("xlink:href") ||
            "";

      if (!src) return null;

      const alt =
        image instanceof docWindow.HTMLImageElement
          ? image.alt
          : image.getAttribute("aria-label") || image.getAttribute("title") || "";

      return {
        src: new URL(src, doc.baseURI).toString(),
        alt,
      };
    };

    const openImage = (event: Event) => {
      const image = getZoomImage(event.target);
      if (!image) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onImageOpenRef.current?.(image);
    };

    let pointerStart: { x: number; y: number } | null = null;

    const handlePointerDown = (event: PointerEvent) => {
      if (!getZoomImage(event.target)) return;
      pointerStart = { x: event.clientX, y: event.clientY };
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!pointerStart) return;
      const moved =
        Math.abs(event.clientX - pointerStart.x) > 8 ||
        Math.abs(event.clientY - pointerStart.y) > 8;
      pointerStart = null;
      if (!moved) {
        openImage(event);
      }
    };

    const handleClick = (event: MouseEvent) => {
      openImage(event);
    };

    const handleTouchStart = (event: TouchEvent) => {
      const target = event.target;
      if (!getZoomImage(target)) return;
      event.stopPropagation();
    };

    doc.addEventListener("pointerdown", handlePointerDown, true);
    doc.addEventListener("pointerup", handlePointerUp, true);
    doc.addEventListener("click", handleClick, true);
    doc.addEventListener("touchstart", handleTouchStart, true);
    return () => {
      doc.removeEventListener("pointerdown", handlePointerDown, true);
      doc.removeEventListener("pointerup", handlePointerUp, true);
      doc.removeEventListener("click", handleClick, true);
      doc.removeEventListener("touchstart", handleTouchStart, true);
    };
  }, []);

  const cleanupChapterDocuments = useCallback(() => {
    chapterCleanupsRef.current.forEach((cleanup) => cleanup());
    chapterCleanupsRef.current.clear();
  }, []);

  const cleanupReader = useCallback(() => {
    const controller = readerControllerRef.current;
    readerControllerRef.current = null;
    controller?.abort();
    cleanupChapterDocuments();

    const view = viewRef.current;
    viewRef.current = null;

    if (view) {
      try {
        if (!openingViewsRef.current.has(view)) view.close?.();
      } catch (err) {
        console.error("Failed to cleanup reader view:", err);
      } finally {
        view.parentNode?.removeChild(view as unknown as Node);
      }
    }
  }, [cleanupChapterDocuments, viewRef]);

  const initReader = useCallback(async (signal: AbortSignal) => {
    const cancelled = () => signal.aborted || library !== getOfflineLibrary();
    if (!containerRef.current || cancelled()) return;

    try {
      const compatibilityError = getReaderCompatibilityError();
      if (compatibilityError) {
        throw new Error(compatibilityError);
      }

      compatibilityModeRef.current = shouldUseReaderCompatibilityMode();
      setLoadingMsg(
        compatibilityModeRef.current ? "加载兼容阅读模式…" : "加载阅读器引擎…"
      );
      setLoadingDetail("引擎、书籍与阅读进度并行准备");

      // Download the file alongside the engine, before waiting for progress.
      const filePromise = loadBookFile(signal);
      void filePromise.catch(() => {
        // Initialization reports any download error when it awaits the file.
      });
      await ensureFoliateScript();

      if (cancelled() || !containerRef.current) return;
      setLoadingMsg("创建视图…");
      setLoadingDetail("正在挂载阅读画布");

      const view = document.createElement("foliate-view") as unknown as FoliateView;
      view.style.height = "100%";
      view.style.width = "100%";
      view.style.display = "block";
      containerRef.current.replaceChildren();
      containerRef.current.appendChild(view as unknown as Node);
      viewRef.current = view;
      await waitForNonZeroRect(view as unknown as HTMLElement, signal);
      if (cancelled()) return;

      let loadedSections: Set<number> | null = new Set();
      const handleLoad = (e: CustomEvent) => {
        if (cancelled() || viewRef.current !== view) return;
        const { doc, index } = e.detail ?? {};
        if (!doc?.documentElement || !Number.isInteger(index) || index < 0) return;
        loadedSections?.add(index);
        try {
          const book = view.book;
          setToc(book?.toc || []);
          setBookTitle(normalizeMetadataText(book?.metadata?.title) || fallbackTitleRef.current);
          setBookAuthor(normalizeMetadataText(book?.metadata?.author) || fallbackAuthorRef.current);
          const cleanups = chapterCleanupsRef.current;
          for (const [chapter, cleanup] of cleanups) {
            if (!chapter.defaultView?.frameElement?.isConnected) {
              cleanup();
              cleanups.delete(chapter);
            }
          }
          if (!cleanups.has(doc)) {
            const unbindControls = bindReaderDocument(doc, view);
            const unbindImageZoom = bindImageZoomDocument(doc);
            cleanups.set(doc, () => {
              unbindControls?.();
              unbindImageZoom?.();
            });
          }
          cleanInlineStyles(doc);
        } catch (err) {
          console.error("Failed to handle book load event:", err);
        }
      };

      const handleRelocate = (e: CustomEvent) => {
        if (cancelled() || viewRef.current !== view) return;
        try {
          const { cfi, fraction, tocItem, pageItem, location } = e.detail;

          const pctRaw = Number(((fraction || 0) * 100).toFixed(2));
          setPercentage(pctRaw);

          if (cfi) {
            setCurrentCFI(cfi);
            updateProgressRef.current(cfi, pctRaw);
          }

          if (tocItem?.label) {
            setCurrentChapter(tocItem.label);
            setCurrentChapterHref(tocItem.href || "");
          }

          updatePageLabel(pageItem, location);
        } catch (err) {
          console.error("Failed to handle relocate event:", err);
        }
      };

      view.addEventListener?.("load", handleLoad);
      view.addEventListener?.("relocate", handleRelocate);
      signal.addEventListener("abort", () => {
        view.removeEventListener?.("load", handleLoad);
        view.removeEventListener?.("relocate", handleRelocate);
      }, { once: true });

      if (cancelled()) return;
      setLoadingMsg("获取书籍…");
      setLoadingDetail("等待预取完成（通常已在后台进行）");

      const file = await filePromise;

      if (cancelled()) return;

      // Soft-wait for progress so we open near the last location without blocking
      // cold starts when the progress API is slow.
      if (progressLoadingRef.current) {
        setLoadingDetail("同步阅读进度（最多约 0.4 秒）");
        await waitUntil(() => cancelled() || !progressLoadingRef.current, 400);
      }

      if (cancelled()) return;
      setLoadingMsg("打开书籍…");
      setLoadingDetail("解析章节并定位阅读位置");

      try {
        const openingViews = openingViewsRef.current;
        openingViews.add(view);
        const opening = Promise.resolve().then(() => {
          if (!cancelled()) return view.open?.(file);
        }).finally(() => {
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
        if (cancelled()) return;
        console.error("Failed to open book:", err);
        // Provide more user-friendly error message for mobile browsers
        const errorMessage = err instanceof Error ? err.message : "未知错误";
        if (errorMessage.includes('external') || errorMessage.includes('permission')) {
          throw new Error('打开书籍失败：请允许访问文件，或尝试使用 Chrome 浏览器');
        }
        throw new Error(`打开书籍失败：${errorMessage}`);
      }

      if (cancelled()) return;

      view.renderer?.setStyles?.(getStylesheetRef.current());
      applyRendererPreferences(view.renderer);

      const savedProgress = progressRef.current;
      appliedRemoteProgressRef.current = savedProgress?.updated_at ?? null;
      const openLocation = async (target: string | number) => {
        const timeoutMessage = "初始化阅读位置超时";
        try {
          // goTo() can swallow errors or resolve for an index outside the book.
          const resolved = await withTimeout(
            view.goTo?.(target), 12000, timeoutMessage, signal,
          ) as void | { index: number };
          if (typeof target === "number") return loadedSections?.has(target) ?? false;
          return !!resolved && !!loadedSections?.has(resolved.index);
        } catch (err) {
          if (cancelled()) return false;
          if (err instanceof Error && err.message === timeoutMessage) {
            // Preserve usable content if only the final positioning stalled.
            if (typeof target === "number" ? loadedSections?.has(target) : loadedSections?.size) {
              return true;
            }
            throw err;
          }
          return false;
        }
      };

      const savedCFI = savedProgress?.cfi;
      const savedLocationLoaded = savedCFI && await openLocation(savedCFI);
      if (cancelled()) return;
      if (!savedLocationLoaded && !await openLocation(0)) {
        if (cancelled()) return;
        throw new Error("无法加载书籍的首个章节，请尝试重新打开");
      }
      if (cancelled()) return;
      loadedSections = null;
      setReaderReady(true);
      setLoading(false);
    } catch (err) {
      if (!cancelled()) {
        cleanupReader();
        setReaderReady(false);
        setError(err instanceof Error ? err.message : "加载书籍失败");
        setLoading(false);
      }
    }
  }, [
    applyRendererPreferences,
    bindImageZoomDocument,
    bindReaderDocument,
    cleanInlineStyles,
    cleanupReader,
    containerRef,
    library,
    loadBookFile,
    updatePageLabel,
    viewRef,
  ]);

  useEffect(() => {
    if (viewRef.current && readerReady) {
      viewRef.current.renderer?.setStyles?.(getStylesheet());
      applyRendererPreferences(viewRef.current.renderer);
    }
  }, [applyRendererPreferences, getStylesheet, readerReady, theme, viewRef]);

  useEffect(() => {
    if (!readerReady || !progress?.remote || !progress.updated_at || !progress.cfi) return;
    if (appliedRemoteProgressRef.current === progress.updated_at) return;

    appliedRemoteProgressRef.current = progress.updated_at;
    void viewRef.current?.goTo?.(progress.cfi);
  }, [progress, readerReady, viewRef]);

  useEffect(() => {
    if (!readerReady) return;
    const contents = viewRef.current?.renderer?.getContents?.() ?? [];
    contents.forEach(({ doc }) => {
      if (!doc) return;
      cleanInlineStyles(doc);
    });
  }, [cleanInlineStyles, readerReady, theme, viewRef]);

  useEffect(() => {
    // Start as soon as auth or offline copy is ready — do not wait for progress API.
    if (!canLoad || !bookId) return;

    const controller = new AbortController();
    readerControllerRef.current = controller;
    fallbackTitleRef.current = "";
    fallbackAuthorRef.current = "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset UI for the external book load.
    setLoading(true);
    setReaderReady(false);
    setError(null);
    setLoadingMsg("准备阅读环境…");
    setLoadingDetail("引擎、书籍与进度并行加载");
    queueMicrotask(() => {
      if (!controller.signal.aborted) void initReader(controller.signal);
    });

    return () => {
      if (readerControllerRef.current === controller) cleanupReader();
    };
  }, [cleanupReader, initReader, canLoad, bookId]);

  return {
    toc,
    bookTitle,
    bookAuthor,
    percentage,
    currentCFI,
    currentChapter,
    currentChapterHref,
    currentPageLabel,
    error,
    loading,
    loadingMsg,
    loadingDetail,
    cleanupReader,
  };
}
