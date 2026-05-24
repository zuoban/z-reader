"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { FoliateView, type TOCItem } from "@/lib/types";
import type { ReaderTheme } from "@/hooks/useReaderTheme";
import { PRESET_STYLES } from "@/hooks/useReaderTheme";

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T> | T, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(message)), ms);
    Promise.resolve(promise)
      .then(resolve, reject)
      .finally(() => window.clearTimeout(timeoutId));
  });
}

function waitForNonZeroRect(element: HTMLElement, timeoutMs = 3000): Promise<void> {
  const startedAt = window.performance.now();

  return new Promise((resolve) => {
    const check = () => {
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
    const script = document.querySelector('script[src="/foliate/view.js"]');
    if (!script) {
      throw new Error("阅读器脚本未加载，请检查网络连接");
    }
    throw new Error("阅读器组件注册失败，请尝试使用 Chrome 浏览器");
  }
}

interface UseFoliateViewOptions {
  bookId: string;
  containerRef: RefObject<HTMLDivElement | null>;
  viewRef: RefObject<FoliateView | null>;
  isAuthenticated: boolean;
  progressLoading: boolean;
  progress: { cfi: string; percentage: number; updated_at?: string; remote?: boolean } | null;
  theme: ReaderTheme;
  getStylesheet: () => string;
  updateProgress: (cfi: string, percentage: number) => void;
  bindReaderDocument: (doc: Document) => void;
  bindHeaderInteractionDocument: (doc: Document) => void;
  cleanupHeaderInteractionDocuments: () => void;
  onImageOpen?: (image: { src: string; alt: string }) => void;
}

export function useFoliateView({
  bookId,
  containerRef,
  viewRef,
  isAuthenticated,
  progressLoading,
  progress,
  theme,
  getStylesheet,
  updateProgress,
  bindReaderDocument,
  bindHeaderInteractionDocument,
  cleanupHeaderInteractionDocuments,
  onImageOpen,
}: UseFoliateViewOptions) {
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
  const [loadingMsg, setLoadingMsg] = useState("初始化中...");

  const destroyedRef = useRef(false);
  const progressRef = useRef(progress);
  const themeRef = useRef(theme);
  const getStylesheetRef = useRef(getStylesheet);
  const updateProgressRef = useRef(updateProgress);
  const onImageOpenRef = useRef(onImageOpen);
  const scriptLoadedRef = useRef(false);
  const appliedRemoteProgressRef = useRef<string | null>(null);
  const imageDocCleanupsRef = useRef<Map<Document, () => void>>(new Map());
  const firstDocumentLoadedRef = useRef(false);
  const revealScheduledRef = useRef(false);
  const compatibilityModeRef = useRef(false);

  useEffect(() => {
    if (!currentCFI && progress?.cfi) {
      queueMicrotask(() => {
        setCurrentCFI(progress.cfi);
        setPercentage(progress.percentage);
      });
    }
  }, [progress, currentCFI]);

  useEffect(() => {
    progressRef.current = progress;
    themeRef.current = theme;
    getStylesheetRef.current = getStylesheet;
    updateProgressRef.current = updateProgress;
    onImageOpenRef.current = onImageOpen;
  }, [getStylesheet, onImageOpen, progress, theme, updateProgress]);

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
    if (imageDocCleanupsRef.current.has(doc)) return;
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
    imageDocCleanupsRef.current.set(doc, () => {
      doc.removeEventListener("pointerdown", handlePointerDown, true);
      doc.removeEventListener("pointerup", handlePointerUp, true);
      doc.removeEventListener("click", handleClick, true);
      doc.removeEventListener("touchstart", handleTouchStart, true);
    });
  }, []);

  const cleanupImageZoomDocuments = useCallback(() => {
    imageDocCleanupsRef.current.forEach((cleanup) => cleanup());
    imageDocCleanupsRef.current.clear();
  }, []);

  const cleanupReader = useCallback(() => {
    destroyedRef.current = true;
    cleanupHeaderInteractionDocuments();
    cleanupImageZoomDocuments();

    const view = viewRef.current;
    viewRef.current = null;

    if (view) {
      try {
        view.close?.();
        if (view.parentNode) {
          view.parentNode.removeChild(view as unknown as Node);
        }
      } catch (err) {
        console.error("Failed to cleanup reader view:", err);
      }
    }

    if (containerRef.current) {
      containerRef.current.innerHTML = "";
    }
  }, [
    cleanupHeaderInteractionDocuments,
    cleanupImageZoomDocuments,
    containerRef,
    viewRef,
  ]);

  const initReader = useCallback(async () => {
    if (!containerRef.current || destroyedRef.current) return;

    try {
      const compatibilityError = getReaderCompatibilityError();
      if (compatibilityError) {
        throw new Error(compatibilityError);
      }

      compatibilityModeRef.current = shouldUseReaderCompatibilityMode();
      setReaderReady(false);
      firstDocumentLoadedRef.current = false;
      revealScheduledRef.current = false;
      setLoadingMsg(compatibilityModeRef.current ? "加载兼容阅读模式..." : "加载阅读器...");

      if (!customElements.get("foliate-view") && !scriptLoadedRef.current) {
        scriptLoadedRef.current = true;

        setLoadingMsg("加载阅读器引擎...");

        // Inject compatibility polyfills for older mobile browsers
        const { injectFoliatePolyfills } = await import("@/lib/foliate-polyfills");
        injectFoliatePolyfills();

        const script = document.createElement("script");
        script.src = "/foliate/view.js";
        script.type = "module";
        script.crossOrigin = "anonymous";
        // Add referrerpolicy for better mobile browser compatibility
        script.referrerPolicy = "no-referrer-when-downgrade";

        const loadPromise = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("加载阅读器脚本超时，请检查网络连接"));
          }, 15000);

          script.onload = () => {
            clearTimeout(timeout);
            resolve();
          };
          script.onerror = (event) => {
            clearTimeout(timeout);
            console.error("Failed to load foliate script:", event);
            reject(new Error("加载阅读器脚本失败，请尝试使用 Chrome 浏览器"));
          };
        });

        document.head.appendChild(script);
        await loadPromise;
      }

      await waitForFoliateView();

      if (destroyedRef.current) return;
      setLoadingMsg("创建视图...");

      const view = document.createElement("foliate-view") as unknown as FoliateView;
      view.style.height = "100%";
      view.style.width = "100%";
      view.style.display = "block";
      containerRef.current.innerHTML = "";
      containerRef.current.appendChild(view as unknown as Node);
      viewRef.current = view;
      await waitForNonZeroRect(view as unknown as HTMLElement);

      view.addEventListener?.("load", (e: CustomEvent) => {
        if (destroyedRef.current || !viewRef.current) return;
        try {
          const book = view.book;
          setToc(book?.toc || []);
          setBookTitle(normalizeMetadataText(book?.metadata?.title));
          setBookAuthor(normalizeMetadataText(book?.metadata?.author));
          firstDocumentLoadedRef.current = true;
          if (!revealScheduledRef.current) {
            revealScheduledRef.current = true;
            window.requestAnimationFrame(() => {
              if (destroyedRef.current || !firstDocumentLoadedRef.current) return;
              setReaderReady(true);
              setLoading(false);
            });
          }

          const doc = e.detail?.doc;
          if (doc) {
            bindReaderDocument(doc);
            bindImageZoomDocument(doc);
            bindHeaderInteractionDocument(doc);
            cleanInlineStyles(doc);
          }
        } catch (err) {
          console.error("Failed to handle book load event:", err);
        }
      });

      view.addEventListener?.("relocate", (e: CustomEvent) => {
        if (destroyedRef.current || !viewRef.current) return;
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

          const doc = e.detail?.doc;
          if (doc) {
            bindReaderDocument(doc);
            bindImageZoomDocument(doc);
            bindHeaderInteractionDocument(doc);
            cleanInlineStyles(doc);
          }
        } catch (err) {
          console.error("Failed to handle relocate event:", err);
        }
      });

      if (destroyedRef.current) return;
      setLoadingMsg("获取书籍...");

      // Dynamic import to avoid circular dependency
      const { api } = await import("@/lib/api");
      const file = await api.createBookFile(bookId);

      if (destroyedRef.current) return;
      setLoadingMsg("打开书籍...");

      try {
        await withTimeout(
          view.open?.(file),
          30000,
          "打开书籍超时：手机浏览器可能不支持当前解压能力，请尝试刷新或使用 Chrome 浏览器",
        );
      } catch (err) {
        console.error("Failed to open book:", err);
        // Provide more user-friendly error message for mobile browsers
        const errorMessage = err instanceof Error ? err.message : "未知错误";
        if (errorMessage.includes('external') || errorMessage.includes('permission')) {
          throw new Error('打开书籍失败：请允许访问文件，或尝试使用 Chrome 浏览器');
        }
        throw new Error(`打开书籍失败：${errorMessage}`);
      }

      if (destroyedRef.current) return;

      view.renderer?.setStyles?.(getStylesheetRef.current());
      applyRendererPreferences(view.renderer);

      const savedProgress = progressRef.current;
      appliedRemoteProgressRef.current = savedProgress?.updated_at ?? null;
      const initPromise = withTimeout(
        view.goTo?.(savedProgress?.cfi || 0),
        12000,
        "初始化阅读位置超时，已显示可用内容",
      );
      await initPromise.catch((err) => {
        if (!firstDocumentLoadedRef.current) {
          throw err;
        }
        console.warn("Reader location initialization timed out after content loaded:", err);
      });
      if (!destroyedRef.current) {
        setReaderReady(true);
        setLoading(false);
      }
    } catch (err) {
      if (!destroyedRef.current) {
        setReaderReady(false);
        setError(err instanceof Error ? err.message : "加载书籍失败");
        setLoading(false);
      }
    }
  }, [
    applyRendererPreferences,
    bindHeaderInteractionDocument,
    bindImageZoomDocument,
    bindReaderDocument,
    bookId,
    cleanInlineStyles,
    containerRef,
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
    if (!isAuthenticated || progressLoading) return;

    destroyedRef.current = false;
    queueMicrotask(() => {
      void initReader();
    });

    return () => {
      cleanupReader();
    };
  }, [cleanupReader, initReader, isAuthenticated, progressLoading]);

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
    cleanupReader,
  };
}
