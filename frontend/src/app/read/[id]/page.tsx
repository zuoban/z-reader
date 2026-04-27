"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  lazy,
  Suspense,
} from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { FoliateView, TOCItem } from "@/lib/types";
import { useProgress } from "@/hooks/useProgress";
import {
  useReaderTheme,
  PRESET_STYLES,
} from "@/hooks/useReaderTheme";
import { useReaderControls } from "@/hooks/useReaderControls";
import { useTTS } from "@/hooks/useTTS";
import { ThemeSettings } from "@/components/ThemeSettings";
import { ReaderTOCSheet } from "@/components/reader/ReaderTOCSheet";
import { ReaderResumePrompt } from "@/components/reader/ReaderResumePrompt";
import { ReaderStatusBar } from "@/components/reader/ReaderStatusBar";
import {
  ReaderAuthLoading,
  ReaderErrorState,
  ReaderLoadingOverlay,
} from "@/components/reader/ReaderStateViews";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { withOpacity } from "@/lib/reader-ui";

// 延迟加载 TTS 组件，首屏不加载
const TTSControls = lazy(() =>
  import("@/components/TTSControls").then((m) => ({ default: m.TTSControls })),
);

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

  const scrollToCurrentChapter = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const activeItem = tocListRef.current?.querySelector(
        '[data-current-chapter="true"]',
      );

      if (!(activeItem instanceof HTMLElement)) {
        return false;
      }

      activeItem.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior,
      });

      return true;
    },
    [],
  );

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
    clearSleepTimer,
    resume: resumeTTS,
    restoreCurrentHighlight: restoreTTSHighlight,
  } = useTTS({ viewRef, onHighlight: handleHighlight, bookId });

  const handleTTSExpandedChange = useCallback(
    (expanded: boolean) => {
      if (!expanded) {
        restoreTTSHighlight();
      }
    },
    [restoreTTSHighlight],
  );

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

  const handleReaderClick = useCallback((event: Event) => {
    if (
      loadingRef.current ||
      tocOpenRef.current ||
      themeSettingsOpenRef.current
    ) {
      return;
    }

    if (
      event.target instanceof Element &&
      event.target.closest('[data-reader-interactive="true"]')
    ) {
      return;
    }

    setIsHeaderVisible((visible) => !visible);
  }, []);

  const bindHeaderInteractionDocument = useCallback(
    (doc: Document) => {
      if (headerInteractionDocsRef.current.has(doc)) return;

      doc.addEventListener("click", handleReaderClick);
      headerInteractionDocsRef.current.add(doc);
    },
    [handleReaderClick],
  );

  const cleanupHeaderInteractionDocuments = useCallback(() => {
    headerInteractionDocsRef.current.forEach((doc) => {
      doc.removeEventListener("click", handleReaderClick);
    });
    headerInteractionDocsRef.current.clear();
  }, [handleReaderClick]);

  const handleBack = useCallback(() => {
    destroyedRef.current = true;
    saveNow();
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
  }, [cleanupHeaderInteractionDocuments, saveNow, router]);

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
    initReader,
    isAuthenticated,
    progressLoading,
  ]);

  useEffect(() => {
    if (!tocOpen || !currentChapter) return;

    const frame = window.requestAnimationFrame(() => {
      scrollToCurrentChapter("smooth");
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [tocOpen, currentChapter, scrollToCurrentChapter]);

  useEffect(() => {
    if (loading || tocOpen || themeSettingsOpen) {
      setIsHeaderVisible(true);
    }
  }, [loading, themeSettingsOpen, tocOpen]);

  if (authLoading || !isAuthenticated) {
    return <ReaderAuthLoading uiScheme={uiScheme} />;
  }

  if (error) {
    return (
      <ReaderErrorState
        error={error}
        uiScheme={uiScheme}
        onBack={handleBack}
      />
    );
  }

  const toolbarButtonClass =
    "relative flex h-10 w-10 min-h-10 min-w-10 items-center justify-center rounded-[0.95rem] transition-[transform,background-color,border-color,box-shadow,color] duration-150 ease-out hover:scale-[1.03] active:scale-95 sm:h-11 sm:w-11 sm:min-h-11 sm:min-w-11 sm:rounded-[1.05rem]";
  const isDarkPreset = theme.preset === "dark";
  const getToolbarButtonStyle = (active = false) => ({
    color: active ? uiScheme.link : uiScheme.buttonText,
    background: active
      ? withOpacity(uiScheme.link, isDarkPreset ? 0.18 : 0.11)
      : "transparent",
    border: `1px solid ${active
      ? withOpacity(uiScheme.link, 0.30)
      : "transparent"}`,
    boxShadow: active
      ? `0 8px 18px -12px ${withOpacity(uiScheme.link, 0.46)}, inset 0 1px 0 ${withOpacity("#ffffff", isDarkPreset ? 0.08 : 0.54)}`
      : "none",
    transition: "all 150ms ease-out",
  });
  const unifiedToolbarStyle = {
    background: withOpacity(uiScheme.cardBg, isDarkPreset ? 0.88 : 0.76),
    border: `1px solid ${withOpacity(uiScheme.cardBorder, isDarkPreset ? 0.42 : 0.54)}`,
    boxShadow: `0 18px 42px -30px ${withOpacity(uiScheme.cardBorder, isDarkPreset ? 0.76 : 0.42)}, inset 0 1px 0 ${withOpacity("#ffffff", isDarkPreset ? 0.08 : 0.82)}`,
    backdropFilter: "blur(18px) saturate(1.15)",
    WebkitBackdropFilter: "blur(18px) saturate(1.15)",
  } as const;
  const statusBarContainerStyle = {
    background: uiScheme.bg,
    borderTop: `1px solid ${withOpacity(uiScheme.cardBorder, isDarkPreset ? 0.3 : 0.4)}`,
  } as const;
  const headerSafeAreaPaddingTop = "env(safe-area-inset-top, 0px)";
  const readerContentInsetTop = "1.25rem";
  const statusBarReservedSpace = "calc(env(safe-area-inset-bottom, 0px) + 2.4rem)";
  const statusBarSafeAreaPaddingBottom = "env(safe-area-inset-bottom, 0px)";

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
            background: uiScheme.bg,
            paddingTop: headerSafeAreaPaddingTop,
            transition: "transform 500ms cubic-bezier(0.32, 0.72, 0, 1), opacity 400ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          <div className="flex justify-center px-3 pt-2 sm:px-4 sm:pt-3">
            <div
              className="pointer-events-auto grid h-[3.25rem] w-full max-w-xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 rounded-[1.25rem] px-1.5 py-1 sm:h-[3.75rem] sm:max-w-2xl sm:gap-2 sm:rounded-[1.5rem] sm:px-2"
              style={unifiedToolbarStyle}
            >
              {/* 左侧按钮组 */}
              <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
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

                <ReaderTOCSheet
                  open={tocOpen}
                  onOpenChange={setTocOpen}
                  toc={toc}
                  tocListRef={tocListRef}
                  currentChapter={currentChapter}
                  uiScheme={uiScheme}
                  overlayContainer={overlayContainer}
                  triggerClassName={toolbarButtonClass}
                  triggerStyle={getToolbarButtonStyle(tocOpen)}
                  onLocateCurrent={() => scrollToCurrentChapter("smooth")}
                  onGoTo={goTo}
                />
              </div>

              {/* 中间标题区域 */}
              <div className="flex min-w-0 flex-1 items-center justify-center px-2 sm:px-4">
                <span
                  className="truncate text-[13px] font-semibold leading-none sm:text-[14px]"
                  style={{ color: withOpacity(uiScheme.fg, isDarkPreset ? 0.78 : 0.72) }}
                >
                  {bookTitle || "阅读中"}
                </span>
              </div>

              {/* 右侧按钮组 */}
              <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
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
                  variant="toolbar"
                  triggerClassName={toolbarButtonClass}
                  triggerStyle={{
                    ...getToolbarButtonStyle(ttsState !== "stopped"),
                    background: "transparent",
                    border: "1px solid transparent",
                    boxShadow: "none",
                  }}
                  resumePromptVisible={resumePromptVisible}
                  resumePromptMessage={resumePromptMessage}
                  ttsStatus={ttsStatus}
                  sleepTimer={sleepTimer}
                  onSleepTimerMinutes={setSleepTimerForMinutes}
                  onClearSleepTimer={clearSleepTimer}
                  onResume={resumeTTS}
                  onExpandedChange={handleTTSExpandedChange}
                  overlayContainer={overlayContainer}
                />
              </Suspense>
              <ThemeSettings
                theme={theme}
                setTheme={setTheme}
                uiScheme={uiScheme}
                open={themeSettingsOpen}
                onOpenChange={setThemeSettingsOpen}
                overlayContainer={overlayContainer}
                triggerClassName={toolbarButtonClass}
                triggerStyle={getToolbarButtonStyle(themeSettingsOpen)}
                isFullscreenSupported={isFullscreenSupported}
                isFullscreen={isFullscreen}
                onToggleFullscreen={toggleFullscreen}
              />
              </div>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className="relative min-h-0 flex-1 overflow-hidden"
            style={{ background: uiScheme.bg }}
          >
            {loading && (
              <ReaderLoadingOverlay
                loadingMsg={loadingMsg}
                readerContentInsetTop={readerContentInsetTop}
                statusBarReservedSpace={statusBarReservedSpace}
                uiScheme={uiScheme}
              />
            )}

            <div
              className="absolute inset-x-0 transition-[top] duration-300 ease-out"
              style={{
                top: readerContentInsetTop,
                bottom: statusBarReservedSpace,
              }}
              onClickCapture={(event) => handleReaderClick(event.nativeEvent)}
            >
              <div
                ref={containerRef}
                className="h-full w-full overflow-hidden"
              />
            </div>

            {isTouchReader && resumePromptVisible && (
              <ReaderResumePrompt
                message={resumePromptMessage}
                uiScheme={uiScheme}
                onResume={resumeTTS}
              />
            )}
          </div>

          <ReaderStatusBar
            percentage={percentage}
            currentChapter={currentChapter}
            currentPageLabel={currentPageLabel}
            containerStyle={statusBarContainerStyle}
            safeAreaPaddingBottom={statusBarSafeAreaPaddingBottom}
            uiScheme={uiScheme}
          />
        </div>
      </div>
    </div>
  );
}
