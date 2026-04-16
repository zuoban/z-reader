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
  const [percentage, setPercentage] = useState(0);
  const [currentChapter, setCurrentChapter] = useState("");
  const [currentPageLabel, setCurrentPageLabel] = useState("");
  const [tocOpen, setTocOpen] = useState(false);
  const [themeSettingsOpen, setThemeSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState("初始化中...");

  const pageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | null>(null);
  const progressRef = useRef(progress);
  const destroyedRef = useRef(false);
  const themeRef = useRef(theme);
  const getStylesheetRef = useRef(getStylesheet);
  const updateProgressRef = useRef(updateProgress);
  // 缓存脚本加载状态，避免重复创建 script 标签
  const scriptLoadedRef = useRef(false);
  const tocListRef = useRef<HTMLDivElement>(null);

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
    resume: resumeTTS,
  } = useTTS({ viewRef, onHighlight: handleHighlight, bookId });

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    getStylesheetRef.current = getStylesheet;
  }, [getStylesheet]);

  useEffect(() => {
    updateProgressRef.current = updateProgress;
  }, [updateProgress]);

  const applyRendererPreferences = useCallback(
    (renderer?: FoliateView["renderer"] | null) => {
      if (!renderer) return;

      renderer.setAttribute("margin", "0");
      renderer.setAttribute("flow", theme.flow);
      renderer.setAttribute("gap", `${theme.gap}%`);
      renderer.setAttribute("max-inline-size", `${theme.maxInlineSize}px`);

      if (theme.animated) {
        renderer.setAttribute("animated", "");
      } else {
        renderer.removeAttribute("animated");
      }
    },
    [theme.animated, theme.flow, theme.gap, theme.maxInlineSize],
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
      if (theme.preset !== "dark") return;

      const preset = PRESET_STYLES.dark;
      const STYLE_ID = "z-reader-dark-overrides";

      // 注入强制覆盖的 CSS 到书籍文档
      let styleEl = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = doc.createElement("style");
        styleEl.id = STYLE_ID;
        doc.head.appendChild(styleEl);
      }
      styleEl.textContent = `
      * {
        color: ${preset.fg} !important;
      }
      a:link, a:visited {
        color: ${preset.link} !important;
      }
    `;
    },
    [theme.preset],
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

  const handleBack = useCallback(() => {
    destroyedRef.current = true;
    saveNow();

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
  }, [saveNow, router]);

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
          script.onerror = () => reject(new Error("Failed to load foliate.js"));
        });

        document.head.appendChild(script);
        await loadPromise;

        let retries = 0;
        while (!customElements.get("foliate-view") && retries < 50) {
          await new Promise((r) => setTimeout(r, 100));
          retries++;
        }

        if (!customElements.get("foliate-view")) {
          throw new Error("foliate-view not registered");
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
          setLoading(false);

          // 给 iframe 的 document 绑定键盘事件，解决点击正文后快捷键失效的问题
          const doc = e.detail?.doc;
          if (doc) {
            bindReaderDocument(doc);
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
            updateProgressRef.current(cfi, Math.round(pctRaw));
          }

          if (tocItem?.label) {
            setCurrentChapter(tocItem.label);
          }

          updatePageLabel(pageItem, location);

          // 翻页后清理新文档的内联样式
          const doc = e.detail?.doc;
          if (doc) {
            bindReaderDocument(doc);
            if (theme.preset === "dark") {
              cleanInlineStyles(doc);
            }
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
          `Failed to open book: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }

      if (destroyedRef.current) return;

      view.renderer?.setStyles?.(getStylesheetRef.current());
      applyRendererPreferences(view.renderer);

      const savedProgress = progressRef.current;
      if (savedProgress?.cfi) {
        try {
          await view.goTo?.(savedProgress.cfi);
        } catch {
          await view.renderer?.next?.();
        }
      } else {
        await view.renderer?.next?.();
      }
    } catch (err) {
      if (!destroyedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load book");
        setLoading(false);
      }
    }
  }, [
    applyRendererPreferences,
    bindReaderDocument,
    bookId,
    cleanInlineStyles,
    theme.preset,
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
  }, [initReader, isAuthenticated, progressLoading]);

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
    "h-7 w-7 rounded-full border bg-transparent! transition-all duration-200 hover:-translate-y-0.5 hover:bg-transparent! hover:opacity-100 active:scale-95 active:bg-transparent! aria-expanded:bg-transparent! dark:bg-transparent! dark:hover:bg-transparent! dark:active:bg-transparent!";
  const isDarkPreset = theme.preset === "dark";
  const getToolbarButtonStyle = (active = false) => ({
    color: active ? uiScheme.link : uiScheme.buttonText,
    background: "transparent",
    border: `1px solid ${active ? withOpacity(uiScheme.link, 0.18) : "transparent"}`,
    boxShadow: active
      ? `0 8px 18px -20px ${withOpacity(uiScheme.link, 0.22)}`
      : "none",
    backdropFilter: "none",
    opacity: active ? 1 : 0.84,
  });
  const toolbarClusterStyle = {
    background: "transparent",
    border: "1px solid transparent",
    boxShadow: "none",
    backdropFilter: "none",
  } as const;
  const statusBarStyle = {
    background: "transparent",
    borderTop: "none",
    boxShadow: "none",
  } as const;
  const mobileResumeCardStyle = {
    background: withOpacity(uiScheme.cardBg, isDarkPreset ? 0.9 : 0.94),
    border: `1px solid ${withOpacity(uiScheme.link, 0.24)}`,
    boxShadow: `0 18px 36px -24px ${withOpacity(uiScheme.link, 0.42)}, inset 0 1px 0 rgba(255,255,255,0.28)`,
  };
  const overlayContainer = pageRef.current;
  const headerSafeAreaPaddingTop = "env(safe-area-inset-top, 0px)";
  const readerContentInsetTop = "calc(env(safe-area-inset-top, 0px) + 2.75rem)";
  const statusBarReservedSpace = "calc(env(safe-area-inset-bottom, 0px) + 2.5rem)";
  const statusBarSafeAreaPaddingBottom = "calc(env(safe-area-inset-bottom, 0px) + 0.5rem)";

  return (
    <div
      ref={pageRef}
      className="fixed inset-0 overflow-hidden overscroll-none"
      style={{ background: uiScheme.bg }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(circle at top left, ${withOpacity(uiScheme.link, 0.12)} 0%, transparent 28%),
            radial-gradient(circle at top right, ${withOpacity(uiScheme.headerBorder, 0.34)} 0%, transparent 24%),
            linear-gradient(180deg, ${withOpacity(uiScheme.headerBg, 0.96)} 0%, ${uiScheme.bg} 28%, ${withOpacity(uiScheme.cardBg, 0.98)} 100%)
          `,
        }}
      />

      <div className="relative flex h-full min-h-0 flex-col">
        <header
          data-reader-interactive="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-50 px-2.5 pb-0.5 transition-all duration-200 ease-out sm:px-3 sm:pb-0.75"
          style={{
            background: "transparent",
            paddingTop: headerSafeAreaPaddingTop,
          }}
        >
          <div className="flex items-center justify-between gap-3 sm:gap-4">
            <div
              className="pointer-events-auto flex items-center gap-0.5 rounded-full px-0.5 py-0.5"
              style={toolbarClusterStyle}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                title="返回书库"
                className="h-7 w-7 shrink-0 rounded-full p-0"
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
                      className="m-4 rounded-[22px] border p-3"
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

            <div
              className="pointer-events-auto flex shrink-0 items-center gap-0.5 rounded-full px-0.5 py-0.5"
              style={toolbarClusterStyle}
            >
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
              />
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
            onResume={resumeTTS}
            overlayContainer={overlayContainer}
          />
        </Suspense>

        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className="relative min-h-0 flex-1 overflow-hidden"
            style={{
              background: `
                linear-gradient(180deg, ${withOpacity(uiScheme.cardBg, 0.96)} 0%, ${withOpacity(uiScheme.bg, 0.94)} 100%)
              `,
            }}
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
                  className="flex min-w-[220px] flex-col items-center gap-4 rounded-[26px] border px-8 py-7 backdrop-blur-xl"
                  style={{
                    background: withOpacity(uiScheme.cardBg, 0.88),
                    borderColor: withOpacity(uiScheme.cardBorder, 0.78),
                    boxShadow: `0 18px 48px ${withOpacity(uiScheme.cardBorder, 0.24)}, inset 0 1px 0 rgba(255,255,255,0.42)`,
                  }}
                >
                  <div
                    className="flex h-20 w-16 items-center justify-center rounded-[20px] border"
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
              ref={containerRef}
              className="absolute"
              style={{
                top: readerContentInsetTop,
                right: 0,
                bottom: statusBarReservedSpace,
                left: 0,
              }}
            />

            {isTouchReader && resumePromptVisible && (
              <div
                data-reader-interactive="true"
                className="pointer-events-none absolute inset-x-0 z-40 flex justify-center px-4 sm:hidden"
                style={{
                  bottom: "calc(env(safe-area-inset-bottom, 0px) + 3.25rem)",
                }}
              >
                <div
                  className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl px-4 py-3 backdrop-blur-xl"
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
                    variant="ghost"
                    size="sm"
                    onClick={() => void resumeTTS()}
                    className="h-10 shrink-0 rounded-xl px-3.5 text-sm font-semibold"
                    style={{
                      color: uiScheme.link,
                      background: withOpacity(uiScheme.buttonBg, 0.72),
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
            className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-4 pt-0.5 sm:px-6"
            style={{
              paddingBottom: statusBarSafeAreaPaddingBottom,
            }}
          >
            <div
              className="mx-auto grid w-full max-w-3xl grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-3 overflow-hidden px-1 pt-1.5 text-[10px] sm:gap-4 sm:text-[11px]"
              style={statusBarStyle}
            >
              <span
                className="min-w-0 truncate text-left font-mono tabular-nums"
                style={{
                  color: withOpacity(uiScheme.mutedText, isDarkPreset ? 0.6 : 0.56),
                  textShadow: isDarkPreset
                    ? `0 1px 6px rgba(0,0,0,0.5)`
                    : `0 1px 6px rgba(255,255,255,0.9)`,
                }}
              >
                {percentage.toFixed(2)}%
              </span>
              <span
                className="min-w-0 truncate text-center"
                style={{
                  color: withOpacity(uiScheme.mutedText, isDarkPreset ? 0.68 : 0.62),
                  textShadow: isDarkPreset
                    ? `0 1px 6px rgba(0,0,0,0.5)`
                    : `0 1px 6px rgba(255,255,255,0.9)`,
                }}
              >
                {currentChapter || "等待定位章节"}
              </span>
              <span
                className="min-w-0 truncate text-right"
                style={{
                  color: withOpacity(uiScheme.mutedText, isDarkPreset ? 0.54 : 0.5),
                  textShadow: isDarkPreset
                    ? `0 1px 6px rgba(0,0,0,0.5)`
                    : `0 1px 6px rgba(255,255,255,0.9)`,
                }}
              >
                {currentPageLabel || "页码加载中"}
              </span>
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
        className="mb-1.5 h-9 w-full justify-start rounded-xl border transition-all duration-150 sm:h-10"
        style={{
          paddingLeft: depth > 0 ? `${depth * 14 + 12}px` : "12px",
          paddingRight: "12px",
          color:
            isCurrentChapter || isHovered ? uiScheme.fg : uiScheme.buttonText,
          background: isCurrentChapter
            ? withOpacity(uiScheme.link, 0.14)
            : isHovered
              ? withOpacity(uiScheme.link, 0.1)
              : withOpacity(uiScheme.buttonBg, 0.5),
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
