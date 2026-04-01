'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { FoliateView, TOCItem } from '@/lib/types';
import { useProgress } from '@/hooks/useProgress';
import { useReaderTheme, ThemeColors } from '@/hooks/useReaderTheme';
import { useTTS } from '@/hooks/useTTS';
import { ThemeSettings } from '@/components/ThemeSettings';
import { TTSControls } from '@/components/TTSControls';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Progress } from '@/components/ui/progress';
import { List, LogOut, ChevronLeft } from 'lucide-react';

export default function ReadPage() {
  const router = useRouter();
  const params = useParams();
  const bookId = params.id as string;
  const { isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { progress, isLoading: progressLoading, updateProgress, saveNow } = useProgress({ bookId });
  const { theme, setTheme, getStylesheet, getUIScheme } = useReaderTheme();
  const uiScheme = getUIScheme();

  const [toc, setToc] = useState<TOCItem[]>([]);
  const [metadata, setMetadata] = useState<{ title?: string; author?: string }>({});
  const [percentage, setPercentage] = useState(0);
  const [currentChapter, setCurrentChapter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('初始化中...');

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | null>(null);
  const progressRef = useRef(progress);
  const destroyedRef = useRef(false);
  const themeRef = useRef(theme);
  const boundDocsRef = useRef<Document[]>([]);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);

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
    if (viewRef.current && !loading) {
      viewRef.current.renderer?.setStyles?.(getStylesheet());
    }
  }, [theme, loading, getStylesheet]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated || progressLoading) return;
    
    destroyedRef.current = false;
    initReader();
    
    return () => {
      destroyedRef.current = true;
      const view = viewRef.current;
      viewRef.current = null;
      
      if (view) {
        try {
          if (view.parentNode) {
            view.parentNode.removeChild(view as unknown as Node);
          }
          view.close?.();
        } catch {}
      }
      
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [isAuthenticated, bookId, progressLoading]);

  async function initReader() {
    if (!containerRef.current || destroyedRef.current) return;

    try {
      setLoadingMsg('加载阅读器...');

      if (!customElements.get('foliate-view')) {
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
          const metadata = book?.metadata;
          setMetadata({
            title: metadata?.title,
            author: typeof metadata?.author === 'string' ? metadata.author : metadata?.author?.[0],
          });
          setToc(book?.toc || []);
          setLoading(false);
          
          // 给 iframe 的 document 绑定键盘事件，解决点击正文后快捷键失效的问题
          const doc = e.detail?.doc;
          if (doc) {
            doc.addEventListener('keydown', keyboardHandler);
            boundDocsRef.current.push(doc);
          }
        } catch {}
      });

      view.addEventListener?.('relocate', (e: CustomEvent) => {
        if (destroyedRef.current || !viewRef.current) return;
        try {
          const { cfi, fraction, tocItem } = e.detail;
          
          const pct = Math.round((fraction || 0) * 100);
          setPercentage(pct);
          
          if (cfi) {
            updateProgress(cfi, pct);
          }

          if (tocItem?.label) {
            setCurrentChapter(tocItem.label);
          }
        } catch {}
      });

      if (destroyedRef.current) return;
      setLoadingMsg('获取书籍...');
      
      const blob = await api.fetchBook(bookId);
      
      if (destroyedRef.current) return;
      setLoadingMsg('打开书籍...');
      
      try {
        const url = URL.createObjectURL(blob);
        await view.open?.(url as unknown as Blob | File);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Failed to open book:', err);
        throw new Error(`Failed to open book: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
      
      if (destroyedRef.current) return;

      view.renderer?.setStyles?.(getStylesheet());
      
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
  }

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

  const keyboardHandler = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    
    switch (e.key) {
      case 'ArrowLeft':
      case 'PageUp':
      case 'k':
      case 'K':
        handlePrev();
        break;
      case 'ArrowRight':
      case 'PageDown':
      case 'j':
      case 'J':
      case ' ':
        if (e.key === ' ' && e.shiftKey) handlePrev();
        else handleNext();
        break;
      case 'Escape':
        handleBack();
        break;
    }
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
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
  }, [handlePrev, handleNext]);

  function handleBack() {
    destroyedRef.current = true;
    saveNow();

    // 清理所有绑定的 iframe 文档的事件
    boundDocsRef.current.forEach(doc => {
      doc.removeEventListener('keydown', keyboardHandler);
    });
    boundDocsRef.current = [];

    const view = viewRef.current;
    viewRef.current = null;
    if (view) {
      try {
        view.close?.();
        if (view.parentNode) {
          view.parentNode.removeChild(view as unknown as Node);
        }
      } catch {}
    }

    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }

    router.push('/shelf');
  }

  useEffect(() => {
    window.addEventListener('keydown', keyboardHandler);
    return () => {
      window.removeEventListener('keydown', keyboardHandler);
      // 清理所有绑定的 iframe 文档的事件
      boundDocsRef.current.forEach(doc => {
        doc.removeEventListener('keydown', keyboardHandler);
      });
      boundDocsRef.current = [];
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

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: uiScheme.bg }}>
      <header
        className="border-b shrink-0 z-50 backdrop-blur-sm transition-colors duration-200"
        style={{
          background: `${uiScheme.headerBg}f0`,
          borderColor: uiScheme.headerBorder
        }}
      >
        <div className="px-3 sm:px-4 h-12 sm:h-14 flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              title="返回书库"
              className="gap-1 sm:gap-2 h-8 sm:h-9 px-2 sm:px-3 shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="text-sm hidden sm:inline">书库</span>
            </Button>

            <Separator orientation="vertical" className="h-5 sm:h-6 hidden sm:block" style={{ background: uiScheme.headerBorder }} />

            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <span className="text-xs sm:text-sm font-medium truncate" style={{ color: uiScheme.fg }}>
                {metadata.title || '加载中...'}
              </span>
              {currentChapter && (
                <span className="text-[10px] sm:text-xs truncate hidden sm:block" style={{ color: uiScheme.mutedText }}>
                  {currentChapter}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Progress
                value={percentage}
                className="w-12 sm:w-24 h-1.5"
              />
              <span className="font-mono text-[10px] sm:text-xs tabular-nums w-7 sm:w-8 hidden sm:block" style={{ color: uiScheme.mutedText }}>
                {percentage}%
              </span>
            </div>

            <Separator orientation="vertical" className="h-5 sm:h-6" style={{ background: uiScheme.headerBorder }} />

            <Sheet>
              <SheetTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    title="目录"
                    className="h-8 w-8 sm:h-9 sm:w-9"
                  />
                }
              >
                <List className="w-4 h-4" />
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-[85vw] sm:w-80 max-w-sm backdrop-blur-sm p-0"
                style={{
                  background: `${uiScheme.cardBg}f5`,
                  borderColor: uiScheme.cardBorder,
                }}
              >
                <SheetHeader className="p-3 sm:p-4 pb-2 sm:pb-3">
                  <SheetTitle className="text-base sm:text-lg font-semibold" style={{ color: uiScheme.fg }}>
                    目录
                  </SheetTitle>
                </SheetHeader>
                <Separator style={{ background: uiScheme.cardBorder }} />
                <ScrollArea className="h-[calc(100vh-70px)] sm:h-[calc(100vh-80px)]">
                  <div className="space-y-0.5 p-3 sm:p-4 pt-2 sm:pt-3">
                    {toc.length > 0 ? (
                      toc.map((item, idx) => (
                        <MemoizedTOCNode key={idx} item={item} onGoTo={goTo} uiScheme={uiScheme} />
                      ))
                    ) : (
                      <p className="text-sm py-8 text-center" style={{ color: uiScheme.mutedText }}>
                        暂无目录
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>

            <ThemeSettings theme={theme} setTheme={setTheme} uiScheme={uiScheme} />

            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              title="退出"
              className="h-8 w-8 sm:h-9 sm:w-9 hidden sm:flex"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <div
        className="flex-1 relative min-h-0"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {loading && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center z-10"
            style={{ background: uiScheme.bg }}
          >
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-16 rounded border-2 flex items-center justify-center"
                   style={{ borderColor: uiScheme.cardBorder }}>
                <div className="w-10 h-10 border-2 rounded-full animate-spin"
                     style={{ borderColor: `${uiScheme.link}20`, borderTopColor: uiScheme.link }} />
              </div>
              <p className="text-sm font-medium" style={{ color: uiScheme.mutedText }}>
                {loadingMsg}
              </p>
            </div>
          </div>
        )}
        <div ref={containerRef} className="absolute inset-0" />

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
        />
      </div>
    </div>
  );
}

function TOCNode({ item, onGoTo, depth = 0, uiScheme }: {
  item: TOCItem;
  onGoTo: (href: string) => void;
  depth?: number;
  uiScheme: ThemeColors
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start transition-colors duration-150 rounded h-8 sm:h-9"
        style={{
          paddingLeft: depth > 0 ? `${depth * 12 + 8}px` : '8px',
          paddingRight: '8px',
          color: isHovered ? uiScheme.fg : uiScheme.buttonText,
          background: isHovered ? `${uiScheme.buttonHoverBg}40` : 'transparent',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => onGoTo(item.href)}
      >
        <span className="text-xs sm:text-sm truncate">{item.label}</span>
      </Button>
      {item.subitems?.map((sub, idx) => (
        <MemoizedTOCNode key={idx} item={sub} onGoTo={onGoTo} depth={depth + 1} uiScheme={uiScheme} />
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
    prevProps.uiScheme.fg === nextProps.uiScheme.fg
  );
});
