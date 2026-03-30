'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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
import { ArrowLeft, ArrowRight, List, LogOut, ChevronLeft, Headphones } from 'lucide-react';

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
  const [loadingMsg, setLoadingMsg] = useState('Initializing...');
  const [showTTS, setShowTTS] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | null>(null);
  const progressRef = useRef(progress);
  const destroyedRef = useRef(false);
  const themeRef = useRef(theme);
  const boundDocsRef = useRef<Document[]>([]);

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
      setLoadingMsg('Loading reader...');

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
      setLoadingMsg('Creating view...');

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
      setLoadingMsg('Fetching book...');
      
      const blob = await api.fetchBook(bookId);
      
      if (destroyedRef.current) return;
      setLoadingMsg('Opening book...');
      
      const file = new File([blob], 'book.epub', { type: 'application/epub+zip' });
      await view.open?.(file);
      
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

  function handlePrev() {
    if (viewRef.current) {
      viewRef.current.prev?.();
    }
  }

  function handleNext() {
    if (viewRef.current) {
      viewRef.current.next?.();
    }
  }

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
      case 't':
      case 'T':
        setShowTTS(prev => !prev);
        break;
    }
  }, []);

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
        if (view.parentNode) {
          view.parentNode.removeChild(view as unknown as Node);
        }
        view.close?.();
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
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-foreground/20 rounded-full animate-subtle-float" 
               style={{ borderRightColor: uiScheme.fg }} />
          <p className="font-heading text-base" style={{ color: uiScheme.mutedText }}>Preparing your book...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 p-8" style={{ background: uiScheme.bg }}>
        <div className="w-16 h-20 rounded border border-destructive/40 flex items-center justify-center bg-destructive/10">
          <span className="text-destructive text-3xl">!</span>
        </div>
        <p className="font-heading text-lg text-destructive">{error}</p>
        <Button onClick={handleBack} className="mt-2">Return to Library</Button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: uiScheme.bg }}>
      <header 
        className="border-b shrink-0 z-50 backdrop-blur-sm transition-colors duration-300" 
        style={{ 
          background: `${uiScheme.headerBg}ee`,
          borderColor: uiScheme.headerBorder 
        }}
      >
        <div className="px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={handleBack}
              title="Return to bookshelf"
              className="gap-2 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="font-sans text-sm">Library</span>
            </Button>
            
            <Separator orientation="vertical" className="h-6 bg-border/40" />
            
            <div className="flex flex-col gap-0.5">
              <span className="font-heading text-sm truncate max-w-[200px]" style={{ color: uiScheme.fg }}>
                {metadata.title || 'Loading...'}
              </span>
              {currentChapter && (
                <span className="font-sans text-xs truncate max-w-[200px]" style={{ color: uiScheme.mutedText }}>
                  {currentChapter}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Progress 
                value={percentage} 
                className="w-20 h-1.5"
              />
              <span className="font-mono text-xs tabular-nums w-7" style={{ color: uiScheme.mutedText }}>
                {percentage}%
              </span>
            </div>

            <Separator orientation="vertical" className="h-6 bg-border/40" />

            <Sheet>
              <SheetTrigger
                render={
                  <Button 
                    variant="ghost" 
                    size="icon-sm" 
                    title="Table of Contents"
                    className="text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  />
                }
              >
                <List className="w-4 h-4" />
              </SheetTrigger>
              <SheetContent 
                side="left" 
                className="w-72 backdrop-blur-sm"
                style={{
                  background: `${uiScheme.cardBg}f5`,
                  borderColor: uiScheme.cardBorder,
                }}
              >
                <SheetHeader className="pb-2">
                  <SheetTitle className="font-heading text-lg" style={{ color: uiScheme.fg }}>
                    Table of Contents
                  </SheetTitle>
                </SheetHeader>
                <Separator className="my-2" style={{ background: uiScheme.cardBorder }} />
                <ScrollArea className="h-[calc(100vh-80px)]">
                  <div className="space-y-1 pr-2">
                    {toc.length > 0 ? (
                      toc.map((item, idx) => (
                        <TOCNode key={idx} item={item} onGoTo={goTo} uiScheme={uiScheme} />
                      ))
                    ) : (
                      <p className="font-sans text-sm py-4" style={{ color: uiScheme.mutedText }}>
                        No table of contents available
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>

            <ThemeSettings theme={theme} setTheme={setTheme} uiScheme={uiScheme} />

            <Button 
              variant="ghost" 
              size="icon-sm"
              onClick={() => setShowTTS(!showTTS)}
              title="Text-to-Speech (T)"
              className={`text-muted-foreground hover:text-foreground hover:bg-muted/30 ${showTTS ? 'bg-muted/30' : ''}`}
            >
              <Headphones className="w-4 h-4" />
            </Button>

            <Button 
              variant="ghost" 
              size="icon-sm"
              onClick={logout}
              title="Sign out"
              className="text-muted-foreground hover:text-foreground hover:bg-muted/30"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 relative min-h-0">
        {loading && (
          <div 
            className="absolute inset-0 flex flex-col items-center justify-center z-10" 
            style={{ background: uiScheme.bg }}
          >
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-16 rounded border-2 border-foreground/20 flex items-center justify-center"
                   style={{ borderColor: uiScheme.cardBorder }}>
                <div className="w-8 h-10 border-2 rounded animate-subtle-float"
                     style={{ borderRightColor: uiScheme.link }} />
              </div>
              <p className="font-heading text-base animate-ink-spread" style={{ color: uiScheme.mutedText }}>
                {loadingMsg}
              </p>
            </div>
          </div>
        )}
        <div ref={containerRef} className="absolute inset-0" />

        {showTTS && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 w-80">
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
        )}

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 z-20">
          <Button
            variant="outline"
            size="icon"
            onClick={handlePrev}
            title="Previous page"
            className="backdrop-blur-sm border-border/40 bg-card/60 hover:bg-card/80 hover:border-border/60 transition-all shadow-sm"
            style={{
              background: `${uiScheme.buttonBg}cc`,
              borderColor: uiScheme.cardBorder,
              color: uiScheme.buttonText,
            }}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          
          <Button
            variant="outline"
            size="icon"
            onClick={handleNext}
            title="Next page"
            className="backdrop-blur-sm border-border/40 bg-card/60 hover:bg-card/80 hover:border-border/60 transition-all shadow-sm"
            style={{
              background: `${uiScheme.buttonBg}cc`,
              borderColor: uiScheme.cardBorder,
              color: uiScheme.buttonText,
            }}
          >
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
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
        className="w-full justify-start transition-all duration-200 rounded-md"
        style={{ 
          paddingLeft: depth > 0 ? `${depth * 12 + 10}px` : '10px',
          color: isHovered ? uiScheme.fg : uiScheme.buttonText,
          background: isHovered ? `${uiScheme.buttonHoverBg}60` : 'transparent',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => onGoTo(item.href)}
      >
        <span className="font-sans text-sm truncate">{item.label}</span>
      </Button>
      {item.subitems?.map((sub, idx) => (
        <TOCNode key={idx} item={sub} onGoTo={onGoTo} depth={depth + 1} uiScheme={uiScheme} />
      ))}
    </div>
  );
}