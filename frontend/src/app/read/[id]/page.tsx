'use client';

import { useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react';
import React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { FoliateView, TOCItem } from '@/lib/types';
import { useProgress } from '@/hooks/useProgress';
import { useReaderTheme, ThemeColors, PRESET_STYLES } from '@/hooks/useReaderTheme';
import { useTTS } from '@/hooks/useTTS';
import { ThemeSettings } from '@/components/ThemeSettings';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  ChevronLeft,
  List,
  LogOut,
} from 'lucide-react';

// 延迟加载 TTS 组件，首屏不加载
const TTSControls = lazy(() => import('@/components/TTSControls').then(m => ({ default: m.TTSControls })));

function withOpacity(color: string, opacity: number) {
  if (!color.startsWith('#')) return color;

  const normalized = color.length === 4
    ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
    : color;

  const hexOpacity = Math.round(Math.min(Math.max(opacity, 0), 1) * 255)
    .toString(16)
    .padStart(2, '0');

  return `${normalized}${hexOpacity}`;
}

export default function ReadPage() {
  const router = useRouter();
  const params = useParams();
  const bookId = params.id as string;
  const { isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { progress, isLoading: progressLoading, updateProgress, saveNow } = useProgress({ bookId });
  const { theme, setTheme, getStylesheet, getUIScheme } = useReaderTheme();
  const uiScheme = getUIScheme();

  const [toc, setToc] = useState<TOCItem[]>([]);
  const [percentage, setPercentage] = useState(0);
  const [currentChapter, setCurrentChapter] = useState('');
  const [tocOpen, setTocOpen] = useState(false);
  const [themeSettingsOpen, setThemeSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('初始化中...');

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | null>(null);
  const progressRef = useRef(progress);
  const destroyedRef = useRef(false);
  const themeRef = useRef(theme);
  const getStylesheetRef = useRef(getStylesheet);
  const updateProgressRef = useRef(updateProgress);
  // 使用 Set 避免重复添加和内存泄漏
  const boundDocsRef = useRef<Set<Document>>(new Set());
  // 缓存脚本加载状态，避免重复创建 script 标签
  const scriptLoadedRef = useRef(false);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const touchStartedInInteractiveUI = useRef(false);
  const tocListRef = useRef<HTMLDivElement>(null);

  // 使用 ref 存储回调函数，避免 keyboardHandler 依赖变化导致频繁重建
  const handlePrevRef = useRef<() => void>(() => {});
  const handleNextRef = useRef<() => void>(() => {});
  const handleBackRef = useRef<() => void>(() => {});

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
  } = useTTS({ viewRef, onHighlight: handleHighlight });

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

  const applyRendererPreferences = useCallback((renderer?: FoliateView['renderer'] | null) => {
    if (!renderer) return;

    renderer.setAttribute('margin', '0');
    renderer.setAttribute('flow', theme.flow);
    renderer.setAttribute('gap', `${theme.gap}%`);
    renderer.setAttribute('max-inline-size', `${theme.maxInlineSize}px`);

    if (theme.animated) {
      renderer.setAttribute('animated', '');
    } else {
      renderer.removeAttribute('animated');
    }
  }, [theme.animated, theme.flow, theme.gap, theme.maxInlineSize]);

  // 清理书籍内容中的内联样式，确保主题样式生效
  const cleanInlineStyles = useCallback((doc: Document) => {
    if (theme.preset !== 'dark') return;

    const preset = PRESET_STYLES.dark;
    const STYLE_ID = 'z-reader-dark-overrides';

    // 注入强制覆盖的 CSS 到书籍文档
    let styleEl = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = doc.createElement('style');
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
  }, [theme.preset]);

  useEffect(() => {
    if (viewRef.current && !loading) {
      viewRef.current.renderer?.setStyles?.(getStylesheet());
      applyRendererPreferences(viewRef.current.renderer);
    }
  }, [applyRendererPreferences, loading, theme, getStylesheet]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
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

  // 使用 effect 同步回调到 ref，供 keyboardHandler 使用
  useEffect(() => {
    handlePrevRef.current = handlePrev;
  }, [handlePrev]);

  useEffect(() => {
    handleNextRef.current = handleNext;
  }, [handleNext]);

  // keyboardHandler 使用 ref 避免依赖变化导致频繁重建
  const keyboardHandler = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    switch (e.key) {
      case 'ArrowLeft':
      case 'PageUp':
      case 'k':
      case 'K':
        handlePrevRef.current();
        break;
      case 'ArrowRight':
      case 'PageDown':
      case 'j':
      case 'J':
      case ' ':
        if (e.key === ' ' && e.shiftKey) handlePrevRef.current();
        else handleNextRef.current();
        break;
      case 'Escape':
        handleBackRef.current();
        break;
    }
  }, []);

  const initReader = useCallback(async () => {
    if (!containerRef.current || destroyedRef.current) return;

    try {
      setLoadingMsg('加载阅读器...');

      // 检查脚本是否已加载，避免重复创建
      if (!customElements.get('foliate-view') && !scriptLoadedRef.current) {
        scriptLoadedRef.current = true; // 标记为正在加载

        const script = document.createElement('script');
        script.src = '/foliate/view.js';
        script.type = 'module';

        const loadPromise = new Promise<void>((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load foliate.js'));
        });

        document.head.appendChild(script);
        await loadPromise;

        let retries = 0;
        while (!customElements.get('foliate-view') && retries < 50) {
          await new Promise(r => setTimeout(r, 100));
          retries++;
        }

        if (!customElements.get('foliate-view')) {
          throw new Error('foliate-view not registered');
        }
      } else {
        // 脚本已加载或正在加载中，等待注册完成
        let retries = 0;
        while (!customElements.get('foliate-view') && retries < 50) {
          await new Promise(r => setTimeout(r, 100));
          retries++;
        }
      }

      if (destroyedRef.current) return;
      setLoadingMsg('创建视图...');

      const view = document.createElement('foliate-view') as unknown as FoliateView;
      view.style.height = '100%';
      view.style.width = '100%';
      view.style.display = 'block';
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(view as unknown as Node);
      viewRef.current = view;

      view.addEventListener?.('load', (e: CustomEvent) => {
        if (destroyedRef.current || !viewRef.current) return;
        try {
          const book = view.book;
          setToc(book?.toc || []);
          setLoading(false);

          // 给 iframe 的 document 绑定键盘事件，解决点击正文后快捷键失效的问题
          const doc = e.detail?.doc;
          if (doc) {
            doc.addEventListener('keydown', keyboardHandler);
            boundDocsRef.current.add(doc);
            // 清理内联样式，确保夜间模式主题生效
            cleanInlineStyles(doc);
          }
        } catch (err) {
          console.error('Failed to handle book load event:', err);
        }
      });

      view.addEventListener?.('relocate', (e: CustomEvent) => {
        if (destroyedRef.current || !viewRef.current) return;
        try {
          const { cfi, fraction, tocItem } = e.detail;

          const pct = Math.round((fraction || 0) * 100);
          setPercentage(pct);

          if (cfi) {
            updateProgressRef.current(cfi, pct);
          }

          if (tocItem?.label) {
            setCurrentChapter(tocItem.label);
          }

          // 翻页后清理新文档的内联样式
          const doc = e.detail?.doc;
          if (doc && theme.preset === 'dark') {
            cleanInlineStyles(doc);
          }
        } catch (err) {
          console.error('Failed to handle relocate event:', err);
        }
      });

      if (destroyedRef.current) return;
      setLoadingMsg('获取书籍...');

      const file = await api.createBookFile(bookId);

      if (destroyedRef.current) return;
      setLoadingMsg('打开书籍...');

      try {
        await view.open?.(file);
      } catch (err) {
        console.error('Failed to open book:', err);
        throw new Error(`Failed to open book: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
        setError(err instanceof Error ? err.message : 'Failed to load book');
        setLoading(false);
      }
    }
  }, [applyRendererPreferences, bookId, keyboardHandler, cleanInlineStyles, theme.preset]);

  useEffect(() => {
    // 主题变化时，重新清理所有已绑定文档的内联样式
    boundDocsRef.current.forEach(doc => {
      cleanInlineStyles(doc);
    });
  }, [cleanInlineStyles]);

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
          console.error('Failed to cleanup view on unmount:', err);
        }
      }

      if (container) {
        container.innerHTML = '';
      }
    };
  }, [initReader, isAuthenticated, progressLoading]);

  const isInteractiveTouchTarget = useCallback((target: EventTarget | null) => {
    return target instanceof Element
      && target.closest('[data-reader-interactive="true"]') !== null;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartedInInteractiveUI.current = isInteractiveTouchTarget(e.target);
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, [isInteractiveTouchTarget]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartedInInteractiveUI.current || isInteractiveTouchTarget(e.target)) {
      touchStartedInInteractiveUI.current = false;
      return;
    }

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - touchStartX.current;
    const deltaY = touchEndY - touchStartY.current;

    // 优化移动端翻页：降低阈值，增加垂直滑动容忍度
    if (Math.abs(deltaX) > 30 && Math.abs(deltaX) > Math.abs(deltaY) * 0.5) {
      if (deltaX > 0) {
        handlePrev();
      } else {
        handleNext();
      }
    }
  }, [handlePrev, handleNext, isInteractiveTouchTarget]);

  useEffect(() => {
    if (!tocOpen || !currentChapter) return;

    const frame = window.requestAnimationFrame(() => {
      const activeItem = tocListRef.current?.querySelector('[data-current-chapter="true"]');
      if (activeItem instanceof HTMLElement) {
        activeItem.scrollIntoView({
          block: 'center',
          inline: 'nearest',
          behavior: 'smooth',
        });
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [tocOpen, currentChapter]);

  const handleBack = useCallback(() => {
    destroyedRef.current = true;
    saveNow();

    // 清理所有绑定的 iframe 文档的事件
    boundDocsRef.current.forEach(doc => {
      doc.removeEventListener('keydown', keyboardHandler);
    });
    boundDocsRef.current.clear();

    const view = viewRef.current;
    viewRef.current = null;
    if (view) {
      try {
        view.close?.();
        if (view.parentNode) {
          view.parentNode.removeChild(view as unknown as Node);
        }
      } catch (err) {
        console.error('Failed to cleanup view during back navigation:', err);
      }
    }

    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }

    router.push('/shelf');
  }, [saveNow, router, keyboardHandler]);

  // 同步 handleBack 到 ref
  useEffect(() => {
    handleBackRef.current = handleBack;
  }, [handleBack]);

  useEffect(() => {
    const boundDocs = boundDocsRef.current;
    window.addEventListener('keydown', keyboardHandler);

    return () => {
      window.removeEventListener('keydown', keyboardHandler);

      // 清理所有绑定的 iframe 文档的事件
      boundDocs.forEach(doc => {
        doc.removeEventListener('keydown', keyboardHandler);
      });
      boundDocs.clear();

      // 停止TTS
      stopTTS();
    };
  }, [keyboardHandler, stopTTS]);

  if (authLoading || !isAuthenticated) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: uiScheme.bg }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 rounded-full animate-spin"
               style={{ borderColor: `${uiScheme.fg}20`, borderTopColor: uiScheme.fg }} />
          <p className="text-sm font-medium" style={{ color: uiScheme.mutedText }}>加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 p-8" style={{ background: uiScheme.bg }}>
        <div className="w-16 h-20 rounded border-2 border-destructive/30 flex items-center justify-center bg-destructive/5">
          <span className="text-destructive text-2xl font-semibold">!</span>
        </div>
        <p className="text-base font-medium text-destructive">{error}</p>
        <Button onClick={handleBack} variant="outline" className="mt-2">返回书库</Button>
      </div>
    );
  }

  const toolbarButtonClass = 'h-8 w-8 rounded-full border transition-all duration-200 hover:-translate-y-0.5 active:scale-95 sm:h-9 sm:w-9';
  const getToolbarButtonStyle = (active = false) => ({
    color: active ? uiScheme.link : uiScheme.buttonText,
    background: active
      ? withOpacity(uiScheme.link, 0.08)
      : withOpacity(uiScheme.buttonBg, 0.72),
    border: `1px solid ${active ? withOpacity(uiScheme.link, 0.2) : withOpacity(uiScheme.cardBorder, 0.48)}`,
    boxShadow: active
      ? `0 14px 24px -20px ${withOpacity(uiScheme.link, 0.45)}, inset 0 1px 0 rgba(255,255,255,0.35)`
      : `0 14px 24px -22px ${withOpacity(uiScheme.headerBorder, 0.34)}, inset 0 1px 0 ${withOpacity(uiScheme.headerBg, 0.35)}`,
  });

  return (
    <div className="relative h-screen overflow-hidden" style={{ background: uiScheme.bg }}>
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

      <div className="relative flex h-full flex-col px-2 py-2 sm:px-3 sm:py-3 lg:px-4 lg:py-4">
        <div
          className="mx-auto flex h-full min-h-0 w-full max-w-[1760px] flex-col overflow-hidden rounded-[26px] border shadow-[0_36px_90px_-44px_rgba(15,23,42,0.42)]"
          style={{
            background: withOpacity(uiScheme.headerBg, 0.82),
            borderColor: withOpacity(uiScheme.headerBorder, 0.58),
          }}
        >
          <header
            className="shrink-0 overflow-hidden border-b px-3 py-2 sm:px-4 sm:py-2.5"
            style={{
              opacity: 0.98,
              backdropFilter: 'blur(14px)',
              background: `
                linear-gradient(180deg, ${withOpacity(uiScheme.headerBg, 0.82)} 0%, ${withOpacity(uiScheme.cardBg, 0.58)} 100%)
              `,
              borderColor: withOpacity(uiScheme.headerBorder, 0.38),
            }}
          >
            <div className="flex items-center justify-between gap-2.5 sm:gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                  title="返回书库"
                  className="h-8 w-8 shrink-0 rounded-full p-0"
                  style={getToolbarButtonStyle(false)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <div className="min-w-0 flex-1 pr-1.5 sm:pr-2">
                  <div className="flex min-h-[2.25rem] items-center gap-2">
                    <div className="min-w-0 flex flex-1 items-center gap-2">
                      <span
                        className="shrink-0 rounded-full px-2 py-1 text-[10px] font-mono tabular-nums tracking-[0.08em]"
                        style={{
                          color: uiScheme.accentText,
                          background: withOpacity(uiScheme.cardBorder, 0.14),
                        }}
                      >
                        {percentage}%
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-[11px] font-medium"
                          style={{ color: uiScheme.fg }}
                        >
                          {currentChapter || '等待定位章节'}
                        </p>
                        <p
                          className="mt-0.5 hidden truncate text-[10px] sm:block"
                          style={{ color: uiScheme.mutedText }}
                        >
                          阅读进度会自动保存
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
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
                    className="w-[85vw] max-w-sm overflow-hidden rounded-r-[28px] p-0 backdrop-blur-xl sm:w-80"
                    style={{
                      background: withOpacity(uiScheme.cardBg, 0.97),
                      borderColor: withOpacity(uiScheme.cardBorder, 0.82),
                      boxShadow: `0 28px 56px -28px ${withOpacity(uiScheme.cardBorder, 0.34)}, inset 0 1px 0 rgba(255,255,255,0.42)`,
                    }}
                  >
                    <SheetHeader
                      className="border-b px-5 py-4 pb-3.5"
                      style={{ borderColor: withOpacity(uiScheme.cardBorder, 0.34) }}
                    >
                      <SheetTitle
                        className="text-base font-semibold sm:text-lg"
                        style={{ color: uiScheme.fg }}
                      >
                        目录
                      </SheetTitle>
                      <p className="text-xs" style={{ color: uiScheme.mutedText }}>
                        快速跳转章节与结构
                      </p>
                    </SheetHeader>
                    <ScrollArea className="h-[calc(100vh-84px)] sm:h-[calc(100vh-88px)]">
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

                <Suspense fallback={null}>
                  <TTSControls
                    state={ttsState}
                    settings={ttsSettings}
                    voices={voices}
                    onStart={startTTS}
                    onStop={stopTTS}
                    onNext={nextTTS}
                    onPrev={prevTTS}
                    onUpdateSettings={updateTTSSettings}
                    uiScheme={uiScheme}
                    variant="toolbar"
                  />
                </Suspense>

                <ThemeSettings
                  theme={theme}
                  setTheme={setTheme}
                  uiScheme={uiScheme}
                  open={themeSettingsOpen}
                  onOpenChange={setThemeSettingsOpen}
                />

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={logout}
                  title="退出"
                  className={`hidden sm:flex ${toolbarButtonClass}`}
                  style={getToolbarButtonStyle(false)}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>

          </header>

          <div
            className="min-h-0 flex-1 p-1.5 sm:p-2"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div
              className="relative h-full overflow-hidden rounded-[20px] border"
              style={{
                background: `
                  linear-gradient(180deg, ${withOpacity(uiScheme.cardBg, 0.96)} 0%, ${withOpacity(uiScheme.bg, 0.94)} 100%)
                `,
                borderColor: withOpacity(uiScheme.cardBorder, 0.9),
                boxShadow: `inset 0 1px 0 ${withOpacity(uiScheme.cardBorder, 0.2)}`,
              }}
            >
              {loading && (
                <div
                  className="absolute inset-0 z-20 flex flex-col items-center justify-center"
                  style={{
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
                      <p className="text-sm font-medium tracking-tight" style={{ color: uiScheme.fg }}>
                        {loadingMsg}
                      </p>
                      <p className="mt-1 text-xs" style={{ color: uiScheme.mutedText }}>
                        正在准备阅读环境与书籍内容
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div ref={containerRef} className="absolute inset-0" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TOCNode({ item, onGoTo, depth = 0, currentChapter, uiScheme }: {
  item: TOCItem;
  onGoTo: (href: string) => void;
  depth?: number;
  currentChapter: string;
  uiScheme: ThemeColors
}) {
  const [isHovered, setIsHovered] = useState(false);
  const isCurrentChapter = currentChapter === item.label;

  return (
    <div>
      <Button
        data-current-chapter={isCurrentChapter ? 'true' : undefined}
        variant="ghost"
        size="sm"
        className="mb-1.5 h-9 w-full justify-start rounded-xl border transition-all duration-150 sm:h-10"
        style={{
          paddingLeft: depth > 0 ? `${depth * 14 + 12}px` : '12px',
          paddingRight: '12px',
          color: isCurrentChapter || isHovered ? uiScheme.fg : uiScheme.buttonText,
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
          boxShadow: isCurrentChapter || isHovered
            ? `0 14px 22px -20px ${withOpacity(uiScheme.link, 0.4)}, inset 0 1px 0 rgba(255,255,255,0.35)`
            : 'none',
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
