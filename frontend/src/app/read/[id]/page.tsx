"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  lazy,
  Suspense,
} from "react";
import React from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { FoliateView, TOCItem } from "@/lib/types";
import { useProgress } from "@/hooks/useProgress";
import {
  useReaderTheme,
  ThemeColors,
  PRESET_STYLES,
} from "@/hooks/useReaderTheme";
import { useReaderControls } from "@/hooks/useReaderControls";
import { useTTS } from "@/hooks/useTTS";
import { ThemeSettings } from "@/components/ThemeSettings";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AlertCircle, ChevronLeft, Expand, List, Shrink } from "lucide-react";

// 延迟加载 TTS 组件，首屏不加载
const TTSControls = lazy(() =>
  import("@/components/TTSControls").then((m) => ({ default: m.TTSControls })),
);

function withOpacity(color: string | undefined, opacity: number) {
  if (!color) return "";
  if (!color.startsWith("#")) return color;

  const normalized =
    color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color;

  const hexOpacity = Math.round(Math.min(Math.max(opacity, 0), 1) * 255)
    .toString(16)
    .padStart(2, "0");

  return `${normalized}${hexOpacity}`;
}

export default function ReadPage() {
  const router = useRouter();
  const params = useParams();
  const bookId = params.id as string;
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const {
    progress,
    isLoading: progressLoading,
    updateProgress,
    saveNow,
  } = useProgress({ bookId });
  const { theme, setTheme, getStylesheet, getUIScheme } = useReaderTheme();
  const uiScheme = getUIScheme();

  const [toc, setToc] = useState<TOCItem[]>([]);
  const [bookTitle, setBookTitle] = useState("");
  const [percentage, setPercentage] = useState(0);
  const [currentChapter, setCurrentChapter] = useState("");
  const [currentPageLabel, setCurrentPageLabel] = useState("");
  const [tocOpen, setTocOpen] = useState(false);
  const [themeSettingsOpen, setThemeSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState("初始化中...");
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [overlayContainer, setOverlayContainer] = useState<HTMLDivElement | null>(null);

  const pageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | null>(null);
  const progressRef = useRef(progress);
  const destroyedRef = useRef(false);
  const themeRef = useRef(theme);
  const getStylesheetRef = useRef(getStylesheet);
  const updateProgressRef = useRef(updateProgress);
  const loadingRef = useRef(loading);
  const tocOpenRef = useRef(tocOpen);
  const themeSettingsOpenRef = useRef(themeSettingsOpen);
  // 缓存脚本加载状态，避免重复创建 script 标签
  const scriptLoadedRef = useRef(false);
  const tocListRef = useRef<HTMLDivElement>(null);
  const headerHideTimerRef = useRef<number | null>(null);
  const headerInteractionDocsRef = useRef<Set<Document>>(new Set());
  const handlePageRef = useCallback((node: HTMLDivElement | null) => {
    pageRef.current = node;
    setOverlayContainer(node);
  }, []);

  const handleHighlight = useCallback((range: Range) => {
    if (viewRef.current?.renderer) {
      viewRef.current.renderer.scrollToAnchor?.(range, true);
    }
  }, []);

  const {
    state: ttsState,
    settings: ttsSettings,
    updateSettings: updateTTSSettings,
    start: startTTS,
    stop: stopTTS,
    next: nextTTS,
    prev: prevTTS,
    voices,
    voicesLoading,
    voicesError,
    reloadVoices,
    resumePromptVisible,
    resumePromptMessage,
    ttsStatus,
    sleepTimer,
    setSleepTimerForMinutes,
    setSleepTimerForSegment,
    clearSleepTimer,
    resume: resumeTTS,
  } = useTTS({ viewRef, onHighlight: handleHighlight, bookId });

  // 合并多个 ref 同步更新，减少独立 useEffect 数量
  useEffect(() => {
    progressRef.current = progress;
    themeRef.current = theme;
    getStylesheetRef.current = getStylesheet;
    updateProgressRef.current = updateProgress;
    loadingRef.current = loading;
    tocOpenRef.current = tocOpen;
    themeSettingsOpenRef.current = themeSettingsOpen;
  }, [
    progress,
    theme,
    getStylesheet,
    updateProgress,
    loading,
    tocOpen,
    themeSettingsOpen,
  ]);

  const applyRendererPreferences = useCallback(
    (renderer?: FoliateView["renderer"] | null) => {
      if (!renderer) return;

      const currentTheme = themeRef.current;
      renderer.setAttribute("margin", "0");
      renderer.setAttribute("flow", currentTheme.flow);
      renderer.setAttribute("gap", `${currentTheme.gap}%`);
      renderer.setAttribute(
        "max-inline-size",
        `${currentTheme.maxInlineSize}px`,
      );

      if (currentTheme.animated) {
        renderer.setAttribute("animated", "");
      } else {
        renderer.removeAttribute("animated");
      }
    },
    [],
  );

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
    [],
  );

  // 清理书籍内容中的内联样式，确保主题样式生效
  const cleanInlineStyles = useCallback(
    (doc: Document) => {
      const STYLE_ID = "z-reader-dark-overrides";
      const styleEl = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;

      if (themeRef.current.preset !== "dark") {
        styleEl?.remove();
        return;
      }

      const preset = PRESET_STYLES.dark;

      // 注入强制覆盖的 CSS 到书籍文档
      let darkStyleEl = styleEl;
      if (!darkStyleEl) {
        darkStyleEl = doc.createElement("style");
        darkStyleEl.id = STYLE_ID;
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
    },
    [],
  );

  useEffect(() => {
    if (viewRef.current && !loading) {
      viewRef.current.renderer?.setStyles?.(getStylesheet());
      applyRendererPreferences(viewRef.current.renderer);
    }
  }, [applyRendererPreferences, loading, theme, getStylesheet]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  const goTo = useCallback((href: string) => {
    if (viewRef.current) {
      viewRef.current.goTo?.(href);
    }
  }, []);

  const handlePrev = useCallback(() => {
    if (viewRef.current) {
      viewRef.current.prev?.();
    }
  }, []);

  const handleNext = useCallback(() => {
    if (viewRef.current) {
      viewRef.current.next?.();
    }
  }, []);

  const clearHeaderHideTimer = useCallback(() => {
    if (headerHideTimerRef.current !== null) {
      window.clearTimeout(headerHideTimerRef.current);
      headerHideTimerRef.current = null;
    }
  }, []);

  const scheduleHeaderHide = useCallback(
    (delay = 2200) => {
      clearHeaderHideTimer();

      if (
        loadingRef.current ||
        tocOpenRef.current ||
        themeSettingsOpenRef.current
      ) {
        return;
      }

      headerHideTimerRef.current = window.setTimeout(() => {
        setIsHeaderVisible(false);
        headerHideTimerRef.current = null;
      }, delay);
    },
    [clearHeaderHideTimer],
  );

  const showHeader = useCallback(
    (delay = 2200) => {
      setIsHeaderVisible(true);
      scheduleHeaderHide(delay);
    },
    [scheduleHeaderHide],
  );

  const handleReaderMouseMove = useCallback(
    (event: MouseEvent) => {
      if (event.clientY <= 88) {
        showHeader(2600);
      }
    },
    [showHeader],
  );

  const handleReaderClick = useCallback(() => {
    showHeader();
  }, [showHeader]);

  const bindHeaderInteractionDocument = useCallback(
    (doc: Document) => {
      if (headerInteractionDocsRef.current.has(doc)) return;

      doc.addEventListener("click", handleReaderClick);
      doc.addEventListener("mousemove", handleReaderMouseMove);
      headerInteractionDocsRef.current.add(doc);
    },
    [handleReaderClick, handleReaderMouseMove],
  );

  const cleanupHeaderInteractionDocuments = useCallback(() => {
    headerInteractionDocsRef.current.forEach((doc) => {
      doc.removeEventListener("click", handleReaderClick);
      doc.removeEventListener("mousemove", handleReaderMouseMove);
    });
    headerInteractionDocsRef.current.clear();
  }, [handleReaderClick, handleReaderMouseMove]);

  const handleBack = useCallback(() => {
    destroyedRef.current = true;
    saveNow();
    clearHeaderHideTimer();
    cleanupHeaderInteractionDocuments();

    if (document.fullscreenElement === pageRef.current) {
      void document.exitFullscreen();
    }

    const view = viewRef.current;
    viewRef.current = null;
    if (view) {
      try {
        view.close?.();
        if (view.parentNode) {
          view.parentNode.removeChild(view as unknown as Node);
        }
      } catch (err) {
        console.error("Failed to cleanup view during back navigation:", err);
      }
    }

    if (containerRef.current) {
      containerRef.current.innerHTML = "";
    }

    router.push("/shelf");
  }, [cleanupHeaderInteractionDocuments, clearHeaderHideTimer, saveNow, router]);

  const {
    isTouchReader,
    isFullscreenSupported,
    isFullscreen,
    toggleFullscreen,
    bindReaderDocument,
  } = useReaderControls({
    pageRef,
    onPrev: handlePrev,
    onNext: handleNext,
    onBack: handleBack,
    onStopTTS: stopTTS,
  });

  const initReader = useCallback(async () => {
    if (!containerRef.current || destroyedRef.current) return;

    try {
      setLoadingMsg("加载阅读器...");

      // 检查脚本是否已加载，避免重复创建
      if (!customElements.get("foliate-view") && !scriptLoadedRef.current) {
        scriptLoadedRef.current = true; // 标记为正在加载

        const script = document.createElement("script");
        script.src = "/foliate/view.js";
        script.type = "module";

        const loadPromise = new Promise<void>((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("加载阅读器脚本失败"));
        });

        document.head.appendChild(script);
        await loadPromise;

        let retries = 0;
        while (!customElements.get("foliate-view") && retries < 50) {
          await new Promise((r) => setTimeout(r, 100));
          retries++;
        }

        if (!customElements.get("foliate-view")) {
          throw new Error("阅读器组件注册失败");
        }
      } else {
        // 脚本已加载或正在加载中，等待注册完成
        let retries = 0;
        while (!customElements.get("foliate-view") && retries < 50) {
          await new Promise((r) => setTimeout(r, 100));
          retries++;
        }
      }

      if (destroyedRef.current) return;
      setLoadingMsg("创建视图...");

      const view = document.createElement(
        "foliate-view",
      ) as unknown as FoliateView;
      view.style.height = "100%";
      view.style.width = "100%";
      view.style.display = "block";
      containerRef.current.innerHTML = "";
      containerRef.current.appendChild(view as unknown as Node);
      viewRef.current = view;

      view.addEventListener?.("load", (e: CustomEvent) => {
        if (destroyedRef.current || !viewRef.current) return;
        try {
          const book = view.book;
          setToc(book?.toc || []);
          setBookTitle(book?.metadata?.title || "");
          setLoading(false);

          // 给 iframe 的 document 绑定键盘事件，解决点击正文后快捷键失效的问题
          const doc = e.detail?.doc;
          if (doc) {
            bindReaderDocument(doc);
            bindHeaderInteractionDocument(doc);
            // 清理内联样式，确保夜间模式主题生效
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
            updateProgressRef.current(cfi, pctRaw);
          }

          if (tocItem?.label) {
            setCurrentChapter(tocItem.label);
          }

          updatePageLabel(pageItem, location);

          // 翻页后清理新文档的内联样式
          const doc = e.detail?.doc;
          if (doc) {
            bindReaderDocument(doc);
            bindHeaderInteractionDocument(doc);
            cleanInlineStyles(doc);
          }
        } catch (err) {
          console.error("Failed to handle relocate event:", err);
        }
      });

      if (destroyedRef.current) return;
      setLoadingMsg("获取书籍...");

      const file = await api.createBookFile(bookId);

      if (destroyedRef.current) return;
      setLoadingMsg("打开书籍...");

      try {
        await view.open?.(file);
      } catch (err) {
        console.error("Failed to open book:", err);
        throw new Error(
          `打开书籍失败：${err instanceof Error ? err.message : "未知错误"}`,
        );
      }

      if (destroyedRef.current) return;

      view.renderer?.setStyles?.(getStylesheetRef.current());
      applyRendererPreferences(view.renderer);

      const savedProgress = progressRef.current;
      await view.init?.({
        lastLocation: savedProgress?.cfi ?? null,
        showTextStart: false,
      });
    } catch (err) {
      if (!destroyedRef.current) {
        setError(err instanceof Error ? err.message : "加载书籍失败");
        setLoading(false);
      }
    }
  }, [
    applyRendererPreferences,
    bindHeaderInteractionDocument,
    bindReaderDocument,
    bookId,
    cleanInlineStyles,
    updatePageLabel,
  ]);

  useEffect(() => {
    // 主题变化时，重新清理所有已绑定文档的内联样式
    const contents = viewRef.current?.renderer?.getContents?.() ?? [];
    contents.forEach(({ doc }) => {
      if (!doc) return;
      cleanInlineStyles(doc);
    });
  }, [cleanInlineStyles, loading]);

  useEffect(() => {
    if (!isAuthenticated || progressLoading) return;

    destroyedRef.current = false;
    const container = containerRef.current;
    void initReader();

    return () => {
      destroyedRef.current = true;
      clearHeaderHideTimer();
      cleanupHeaderInteractionDocuments();

      const view = viewRef.current;
      viewRef.current = null;

      if (view) {
        try {
          // 先调用 close 方法，再移除 DOM 元素
          view.close?.();
          if (view.parentNode) {
            view.parentNode.removeChild(view as unknown as Node);
          }
        } catch (err) {
          console.error("Failed to cleanup view on unmount:", err);
        }
      }

      if (container) {
        container.innerHTML = "";
      }
    };
  }, [
    cleanupHeaderInteractionDocuments,
    clearHeaderHideTimer,
    initReader,
    isAuthenticated,
    progressLoading,
  ]);

  useEffect(() => {
    if (!tocOpen || !currentChapter) return;

    const frame = window.requestAnimationFrame(() => {
      const activeItem = tocListRef.current?.querySelector(
        '[data-current-chapter="true"]',
      );
      if (activeItem instanceof HTMLElement) {
        activeItem.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: "smooth",
        });
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [tocOpen, currentChapter]);

  useEffect(() => {
    if (loading) {
      setIsHeaderVisible(true);
      clearHeaderHideTimer();
      return;
    }

    if (tocOpen || themeSettingsOpen) {
      setIsHeaderVisible(true);
      clearHeaderHideTimer();
      return;
    }

    scheduleHeaderHide(1800);

    return () => {
      clearHeaderHideTimer();
    };
  }, [
    clearHeaderHideTimer,
    loading,
    scheduleHeaderHide,
    themeSettingsOpen,
    tocOpen,
  ]);

  useEffect(() => {
    window.addEventListener("click", handleReaderClick);
    window.addEventListener("mousemove", handleReaderMouseMove);

    return () => {
      window.removeEventListener("click", handleReaderClick);
      window.removeEventListener("mousemove", handleReaderMouseMove);
    };
  }, [handleReaderClick, handleReaderMouseMove]);

  if (authLoading || !isAuthenticated) {
    return (
      <div
        className="h-screen flex items-center justify-center"
        style={{ background: uiScheme.bg }}
      >
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-10 h-10 border-2 rounded-full animate-spin"
            style={{
              borderColor: `${uiScheme.fg}20`,
              borderTopColor: uiScheme.fg,
            }}
          />
          <p
            className="text-sm font-medium"
            style={{ color: uiScheme.mutedText }}
          >
            加载中...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="h-screen flex flex-col items-center justify-center gap-4 p-8"
        style={{ background: uiScheme.bg }}
      >
        <div className="w-16 h-20 rounded border-2 border-destructive/30 flex items-center justify-center bg-destructive/5">
          <span className="text-destructive text-2xl font-semibold">!</span>
        </div>
        <p className="text-base font-medium text-destructive">{error}</p>
        <Button onClick={handleBack} variant="outline" className="mt-2">
          返回书库
        </Button>
      </div>
    );
  }

  const toolbarButtonClass =
    "relative flex items-center justify-center h-7 w-7 rounded-lg transition-all duration-150 ease-out hover:scale-105 active:scale-95 sm:h-8 sm:w-8 sm:rounded-xl";
  const isDarkPreset = theme.preset === "dark";
  const getToolbarButtonStyle = (active = false) => ({
    color: active ? uiScheme.link : uiScheme.buttonText,
    background: active
      ? withOpacity(uiScheme.link, isDarkPreset ? 0.16 : 0.10)
      : withOpacity(uiScheme.cardBorder, isDarkPreset ? 0.10 : 0.06),
    border: `1px solid ${active
      ? withOpacity(uiScheme.link, 0.28)
      : withOpacity(uiScheme.cardBorder, isDarkPreset ? 0.18 : 0.12)}`,
    boxShadow: active
      ? `0 4px 12px -4px ${withOpacity(uiScheme.link, 0.28)}`
      : "none",
    transition: "all 150ms ease-out",
  });
  const unifiedToolbarStyle = {
    background: withOpacity(uiScheme.cardBg, isDarkPreset ? 0.80 : 0.92),
    border: `1px solid ${withOpacity(uiScheme.cardBorder, isDarkPreset ? 0.36 : 0.44)}`,
    boxShadow: `0 8px 32px -8px ${withOpacity(uiScheme.cardBorder, isDarkPreset ? 0.30 : 0.14)}, inset 0 1px 0 ${withOpacity("#ffffff", isDarkPreset ? 0.06 : 0.70)}`,
    backdropFilter: "blur(40px) saturate(180%)",
  } as const;
  const statusBarStyle = {
    background: withOpacity(uiScheme.cardBg, isDarkPreset ? 0.18 : 0.34),
    border: `1px solid ${withOpacity(uiScheme.cardBorder, isDarkPreset ? 0.10 : 0.14)}`,
    boxShadow: `0 8px 18px -18px ${withOpacity(uiScheme.fg, isDarkPreset ? 0.28 : 0.12)}`,
    backdropFilter: "blur(12px) saturate(108%)",
  } as const;
  const statusBarProgressStyle = {
    background: "transparent",
    border: "1px solid transparent",
    boxShadow: "none",
  } as const;
  const statusBarChapterStyle = {
    background: "transparent",
    border: "1px solid transparent",
    boxShadow: "none",
  } as const;
  const statusBarPageStyle = {
    background: "transparent",
    border: "1px solid transparent",
    boxShadow: "none",
  } as const;
  const mobileResumeCardStyle = {
    background: withOpacity(uiScheme.cardBg, isDarkPreset ? 0.9 : 0.94),
    border: `1px solid ${withOpacity(uiScheme.link, 0.24)}`,
    boxShadow: `0 18px 36px -24px ${withOpacity(uiScheme.link, 0.42)}, inset 0 1px 0 rgba(255,255,255,0.28)`,
  };
  const headerSafeAreaPaddingTop = "env(safe-area-inset-top, 0px)";
  const readerContentInsetTop = "0px";
  const statusBarReservedSpace = "calc(env(safe-area-inset-bottom, 0px) + 2.6rem)";
  const statusBarSafeAreaPaddingBottom = "calc(env(safe-area-inset-bottom, 0px) + 0.4rem)";

  return (
    <div
      ref={handlePageRef}
      className="fixed inset-0 overflow-hidden overscroll-none"
      style={{ background: uiScheme.bg }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 70% 50% at 20% 0%, ${withOpacity(uiScheme.link, 0.09)} 0%, transparent 60%),
            radial-gradient(ellipse 50% 40% at 80% 0%, ${withOpacity(uiScheme.headerBorder, 0.18)} 0%, transparent 50%),
            linear-gradient(180deg, ${withOpacity(uiScheme.headerBg, 0.94)} 0%, ${uiScheme.bg} 22%, ${uiScheme.bg} 100%)
          `,
        }}
      />

      <div className="relative flex h-full min-h-0 flex-col">
        <header
          data-reader-interactive="true"
          className={`pointer-events-none absolute inset-x-0 top-0 z-50 sm:px-4 ${
            isHeaderVisible
              ? "translate-y-0 opacity-100"
              : "-translate-y-[calc(100%+env(safe-area-inset-top,0px))] opacity-0"
          }`}
          style={{
            background: "transparent",
            paddingTop: headerSafeAreaPaddingTop,
            transition: "transform 500ms cubic-bezier(0.32, 0.72, 0, 1), opacity 400ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
          onMouseEnter={() => showHeader(3200)}
          onMouseLeave={() => scheduleHeaderHide(900)}
        >
          <div className="flex justify-center px-3 pt-2 sm:px-4 sm:pt-2.5">
            <div
              className="pointer-events-auto flex w-full max-w-2xl items-center gap-1 rounded-xl px-1 py-1 sm:rounded-2xl sm:px-1.5 sm:py-1.5"
              style={unifiedToolbarStyle}
            >
              {/* 左侧按钮组 */}
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleBack}
                  title="返回书库"
                  className={toolbarButtonClass}
                  style={getToolbarButtonStyle(false)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <Sheet open={tocOpen} onOpenChange={setTocOpen}>
                  <SheetTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        title="目录"
                        className={toolbarButtonClass}
                        style={getToolbarButtonStyle(tocOpen)}
                      />
                    }
                  >
                    <List className="h-4 w-4" />
                  </SheetTrigger>
                <SheetContent
                  side="left"
                  container={overlayContainer}
                  className="max-w-sm p-0 backdrop-blur-xl [&_[data-slot=sheet-close]]:top-[calc(env(safe-area-inset-top,0px)+1rem)] sm:w-80 sm:[&_[data-slot=sheet-close]]:top-3"
                  style={{
                    background: withOpacity(uiScheme.cardBg, 0.97),
                    borderColor: withOpacity(uiScheme.cardBorder, 0.82),
                    boxShadow: `0 28px 56px -28px ${withOpacity(uiScheme.cardBorder, 0.34)}, inset 0 1px 0 rgba(255,255,255,0.42)`,
                  }}
                >
                  <SheetHeader
                    className="pb-3.5 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)]"
                    style={{
                      borderColor: withOpacity(uiScheme.cardBorder, 0.34),
                    }}
                  >
                    <SheetTitle
                      className="text-base font-semibold sm:text-lg"
                      style={{ color: uiScheme.fg }}
                    >
                      目录
                    </SheetTitle>
                    <p
                      className="text-xs"
                      style={{ color: uiScheme.mutedText }}
                    >
                      快速跳转章节与结构
                    </p>
                  </SheetHeader>
                  <ScrollArea className="h-[calc(100vh-env(safe-area-inset-top,0px)-126px)] sm:h-[calc(100vh-88px)]">
                    <div
                      ref={tocListRef}
                      className="paper-field m-4 rounded-lg border p-3"
                      style={{
                        background: withOpacity(uiScheme.buttonBg, 0.44),
                        borderColor: withOpacity(uiScheme.cardBorder, 0.42),
                      }}
                    >
                      {toc.length > 0 ? (
                        toc.map((item, idx) => (
                          <MemoizedTOCNode
                            key={idx}
                            item={item}
                            onGoTo={goTo}
                            currentChapter={currentChapter}
                            uiScheme={uiScheme}
                          />
                        ))
                      ) : (
                        <p
                          className="py-8 text-center text-sm"
                          style={{ color: uiScheme.mutedText }}
                        >
                          暂无目录
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </SheetContent>
              </Sheet>
              </div>

              {/* 中间标题区域 */}
              <div className="flex min-w-0 flex-1 items-center justify-center px-1">
                <span
                  className="truncate text-[12px] font-medium leading-none tracking-[-0.01em] sm:text-[13px]"
                  style={{ color: withOpacity(uiScheme.fg, isDarkPreset ? 0.70 : 0.65) }}
                >
                  {bookTitle || "阅读中"}
                </span>
              </div>

              {/* 右侧按钮组 */}
              <div className="flex shrink-0 items-center gap-0.5">
              {isFullscreenSupported && (
                <Button
                  data-reader-interactive="true"
                  variant="ghost"
                  size="icon"
                  onClick={() => void toggleFullscreen()}
                  title={isFullscreen ? "退出全屏" : "进入全屏"}
                  aria-label={isFullscreen ? "退出全屏" : "进入全屏"}
                  className={toolbarButtonClass}
                  style={getToolbarButtonStyle(false)}
                >
                  {isFullscreen ? (
                    <Shrink className="h-4 w-4" />
                  ) : (
                    <Expand className="h-4 w-4" />
                  )}
                </Button>
              )}

              <ThemeSettings
                theme={theme}
                setTheme={setTheme}
                uiScheme={uiScheme}
                open={themeSettingsOpen}
                onOpenChange={setThemeSettingsOpen}
                overlayContainer={overlayContainer}
                triggerClassName={toolbarButtonClass}
                triggerStyle={getToolbarButtonStyle(themeSettingsOpen)}
              />
              </div>
            </div>
          </div>
        </header>

        <Suspense fallback={null}>
          <TTSControls
            state={ttsState}
            settings={ttsSettings}
            voices={voices}
            voicesLoading={voicesLoading}
            voicesError={voicesError}
            onReloadVoices={reloadVoices}
            onStart={startTTS}
            onStop={stopTTS}
            onNext={nextTTS}
            onPrev={prevTTS}
            onUpdateSettings={updateTTSSettings}
            uiScheme={uiScheme}
            resumePromptVisible={resumePromptVisible}
            resumePromptMessage={resumePromptMessage}
            ttsStatus={ttsStatus}
            sleepTimer={sleepTimer}
            onSleepTimerMinutes={setSleepTimerForMinutes}
            onSleepTimerSegment={setSleepTimerForSegment}
            onClearSleepTimer={clearSleepTimer}
            onResume={resumeTTS}
            overlayContainer={overlayContainer}
          />
        </Suspense>

        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className="relative min-h-0 flex-1 overflow-hidden"
            style={{ background: uiScheme.bg }}
          >
            {loading && (
              <div
                className="absolute z-20 flex flex-col items-center justify-center"
                style={{
                  top: readerContentInsetTop,
                  right: 0,
                  bottom: statusBarReservedSpace,
                  left: 0,
                  background: `
                    linear-gradient(180deg, ${withOpacity(uiScheme.bg, 0.88)} 0%, ${withOpacity(uiScheme.cardBg, 0.94)} 100%)
                  `,
                }}
              >
                <div
                  className="paper-reveal-soft paper-panel paper-stack flex min-w-[240px] flex-col items-center gap-4 rounded-[1.75rem] border px-8 py-8 backdrop-blur-xl"
                  style={{
                    background: withOpacity(uiScheme.cardBg, 0.9),
                    borderColor: withOpacity(uiScheme.cardBorder, 0.78),
                    boxShadow: `0 24px 56px -28px ${withOpacity(uiScheme.cardBorder, 0.3)}, inset 0 1px 0 rgba(255,255,255,0.42)`,
                  }}
                >
                  <div
                    className="flex h-20 w-16 items-center justify-center rounded-[1.25rem] border"
                    style={{
                      background: withOpacity(uiScheme.buttonBg, 0.52),
                      borderColor: withOpacity(uiScheme.cardBorder, 0.72),
                    }}
                  >
                    <div
                      className="h-10 w-10 animate-spin rounded-full border-2"
                      style={{
                        borderColor: withOpacity(uiScheme.link, 0.2),
                        borderTopColor: uiScheme.link,
                      }}
                    />
                  </div>
                  <div className="text-center">
                    <p
                      className="text-sm font-medium tracking-tight"
                      style={{ color: uiScheme.fg }}
                    >
                      {loadingMsg}
                    </p>
                    <p
                      className="mt-1 text-xs"
                      style={{ color: uiScheme.mutedText }}
                    >
                      正在准备阅读环境与书籍内容
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div
              className="absolute inset-x-2 transition-[top] duration-300 ease-out sm:inset-x-5 lg:inset-x-8"
              style={{
                top: readerContentInsetTop,
                bottom: statusBarReservedSpace,
              }}
            >
              <div
                className="paper-panel paper-stack relative h-full overflow-hidden rounded-[1.5rem] border sm:rounded-[2rem]"
                style={{
                  borderColor: withOpacity(uiScheme.cardBorder, isDarkPreset ? 0.50 : 0.60),
                  background: uiScheme.cardBg,
                  boxShadow: `0 20px 60px -24px ${withOpacity(uiScheme.cardBorder, 0.28)}, 0 0 0 1px ${withOpacity(uiScheme.cardBorder, isDarkPreset ? 0.15 : 0.08)}`,
                }}
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.5),transparent)]" />
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 w-8"
                  style={{
                    background: `linear-gradient(90deg, ${withOpacity(uiScheme.cardBorder, isDarkPreset ? 0.14 : 0.08)} 0%, transparent 100%)`,
                  }}
                />
                <div
                  className="pointer-events-none absolute inset-y-0 right-0 w-8"
                  style={{
                    background: `linear-gradient(270deg, ${withOpacity(uiScheme.cardBorder, isDarkPreset ? 0.12 : 0.06)} 0%, transparent 100%)`,
                  }}
                />
                <div
                  ref={containerRef}
                  className="absolute inset-0"
                />
              </div>
            </div>

            {isTouchReader && resumePromptVisible && (
              <div
                data-reader-interactive="true"
                className="pointer-events-none absolute inset-x-0 z-40 flex justify-center px-4 sm:hidden"
                style={{
                  bottom: "calc(env(safe-area-inset-bottom, 0px) + 3.25rem)",
                }}
              >
                <div
                  className="reading-status-panel pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-[1.15rem] px-4 py-3 backdrop-blur-xl"
                  style={mobileResumeCardStyle}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: withOpacity(uiScheme.link, 0.14),
                      color: uiScheme.link,
                    }}
                  >
                    <AlertCircle className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-sm font-semibold"
                      style={{ color: uiScheme.fg }}
                    >
                      朗读已暂停
                    </p>
                    <p
                      className="mt-0.5 line-clamp-2 text-xs leading-5"
                      style={{ color: uiScheme.mutedText }}
                    >
                      {resumePromptMessage}
                    </p>
                  </div>
                  <Button
                    data-reader-interactive="true"
                    variant="outline"
                    size="sm"
                    onClick={() => void resumeTTS()}
                    className="h-10 shrink-0 rounded-xl px-3.5 text-sm font-semibold"
                    style={{
                      color: uiScheme.link,
                      border: `1px solid ${withOpacity(uiScheme.link, 0.18)}`,
                    }}
                  >
                    继续
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-4 sm:px-8"
            style={{ paddingBottom: statusBarSafeAreaPaddingBottom }}
          >
            <div
              className="reading-status-panel pointer-events-auto flex w-full max-w-md items-center gap-0.5 overflow-hidden rounded-xl px-2 py-0.5 text-xs transition-[background,border-color,box-shadow] duration-200 ease-out sm:text-[13px]"
              style={statusBarStyle}
            >
              {/* 左侧：进度数字 */}
              <div
                className="flex min-h-8 shrink-0 items-center rounded-lg px-2.5 sm:px-3"
                style={statusBarProgressStyle}
              >
                <span
                  className="min-w-[4ch] font-mono text-[10.5px] font-normal tabular-nums tracking-[0.04em]"
                  style={{
                    color: withOpacity(
                      uiScheme.buttonText,
                      isDarkPreset ? 0.58 : 0.56,
                    ),
                  }}
                >
                  {percentage.toFixed(1)}%
                </span>
              </div>

              {/* 中间：当前章节 */}
              <span
                className="flex min-h-8 min-w-0 flex-1 items-center justify-center truncate rounded-lg px-2.5 text-center text-[10.5px] font-normal transition-colors duration-200 sm:px-3 sm:text-[11px]"
                style={{
                  ...statusBarChapterStyle,
                  color: withOpacity(uiScheme.fg, isDarkPreset ? 0.44 : 0.42),
                }}
              >
                {currentChapter || "—"}
              </span>

              {/* 右侧：页码 */}
              <div
                className="flex min-h-8 shrink-0 items-center rounded-lg px-2.5 sm:px-3"
                style={statusBarPageStyle}
              >
                <span
                  className="font-normal tabular-nums text-[10.5px] tracking-[0.02em]"
                  style={{ color: withOpacity(uiScheme.fg, isDarkPreset ? 0.34 : 0.34) }}
                >
                  {currentPageLabel || "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TOCNode({
  item,
  onGoTo,
  depth = 0,
  currentChapter,
  uiScheme,
}: {
  item: TOCItem;
  onGoTo: (href: string) => void;
  depth?: number;
  currentChapter: string;
  uiScheme: ThemeColors;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const isCurrentChapter = currentChapter === item.label;

  return (
    <div>
      <Button
        data-current-chapter={isCurrentChapter ? "true" : undefined}
        variant="ghost"
        size="sm"
        className="paper-motion-interactive paper-field mb-1.5 h-9 w-full justify-start rounded-xl border sm:h-10"
        style={{
          paddingLeft: depth > 0 ? `${depth * 14 + 12}px` : "12px",
          paddingRight: "12px",
          color:
            isCurrentChapter || isHovered ? uiScheme.fg : uiScheme.buttonText,
          background: isCurrentChapter
            ? withOpacity(uiScheme.link, 0.14)
            : isHovered
              ? withOpacity(uiScheme.link, 0.1)
              : withOpacity(uiScheme.buttonBg, 0.72),
          borderColor: isCurrentChapter
            ? withOpacity(uiScheme.link, 0.28)
            : isHovered
              ? withOpacity(uiScheme.link, 0.18)
              : withOpacity(uiScheme.cardBorder, 0.4),
          boxShadow:
            isCurrentChapter || isHovered
              ? `0 14px 22px -20px ${withOpacity(uiScheme.link, 0.4)}, inset 0 1px 0 rgba(255,255,255,0.35)`
              : "none",
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => onGoTo(item.href)}
      >
        <span className="truncate text-xs sm:text-sm">{item.label}</span>
      </Button>
      {item.subitems?.map((sub, idx) => (
        <MemoizedTOCNode
          key={idx}
          item={sub}
          onGoTo={onGoTo}
          depth={depth + 1}
          currentChapter={currentChapter}
          uiScheme={uiScheme}
        />
      ))}
    </div>
  );
}

const MemoizedTOCNode = React.memo(TOCNode, (prevProps, nextProps) => {
  return (
    prevProps.item.href === nextProps.item.href &&
    prevProps.item.label === nextProps.item.label &&
    prevProps.item.subitems?.length === nextProps.item.subitems?.length &&
    prevProps.depth === nextProps.depth &&
    prevProps.currentChapter === nextProps.currentChapter &&
    prevProps.uiScheme.fg === nextProps.uiScheme.fg
  );
});
