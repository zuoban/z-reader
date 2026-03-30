'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { useProgress } from '@/hooks/useProgress';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface TOCItem {
  label: string;
  href: string;
  subitems?: TOCItem[];
}

export default function ReadPage() {
  const router = useRouter();
  const params = useParams();
  const bookId = params.id as string;
  const { isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { progress, isLoading: progressLoading, updateProgress, saveNow } = useProgress({ bookId });

  const [toc, setToc] = useState<TOCItem[]>([]);
  const [metadata, setMetadata] = useState<{ title?: string; author?: string }>({});
  const [percentage, setPercentage] = useState(0);
  const [currentChapter, setCurrentChapter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('Initializing...');

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<any>(null);
  const progressRef = useRef(progress);
  const destroyedRef = useRef(false);

  // 保持 progress 的最新值
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated || progressLoading) return;
    
    destroyedRef.current = false;
    initReader();
    
    // 清理函数
    return () => {
      destroyedRef.current = true;
      const view = viewRef.current;
      viewRef.current = null;
      
      if (view) {
        try {
          // 先移除 view 从 DOM
          if (view.parentNode) {
            view.parentNode.removeChild(view);
          }
          // 再调用 close
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

      // 检查是否已加载
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
        
        // 等待 custom element 注册
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

      const view = document.createElement('foliate-view') as any;
      view.style.height = '100%';
      view.style.width = '100%';
      view.style.display = 'block';
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(view);
      viewRef.current = view;

      // 必须在 open 之前添加事件监听器
      view.addEventListener('load', () => {
        if (destroyedRef.current || !viewRef.current) return;
        try {
          console.log('Book loaded:', view.book);
          const book = view.book;
          setMetadata(book?.metadata || {});
          setToc(book?.toc || []);
          setLoading(false);
        } catch {}
      });

      view.addEventListener('relocate', (e: CustomEvent) => {
        if (destroyedRef.current || !viewRef.current) return;
        try {
          console.log('relocate event:', e.detail);
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
      console.log('Book blob size:', blob.size, 'type:', blob.type);
      setLoadingMsg('Opening book...');
      
      const file = new File([blob], 'book.epub', { type: 'application/epub+zip' });
      await view.open(file);
      
      if (destroyedRef.current) return;
      console.log('view.open() completed, starting renderer...');

      // 设置样式
      view.renderer.setStyles?.(`
        html {
          color-scheme: light dark;
        }
        @media (prefers-color-scheme: dark) {
          a:link { color: lightblue; }
        }
        p, li, blockquote, dd {
          line-height: 1.4;
          text-align: justify;
        }
      `);
      
      // 如果有保存的进度，跳转到该位置
      const savedProgress = progressRef.current;
      if (savedProgress?.cfi) {
        console.log('Restoring progress to:', savedProgress.cfi);
        try {
          await view.goTo(savedProgress.cfi);
        } catch (err) {
          console.error('Failed to restore progress:', err);
          // 如果恢复失败，从开始位置开始
          await view.renderer.next();
        }
      } else {
        // 启动渲染
        await view.renderer.next();
      }
      
      console.log('Renderer started');

    } catch (err) {
      console.error('Failed to init reader:', err);
      if (!destroyedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load book');
        setLoading(false);
      }
    }
  }

  const goTo = useCallback((href: string) => {
    if (viewRef.current) {
      viewRef.current.goTo(href);
    }
  }, []);

  function handlePrev() {
    if (viewRef.current) {
      viewRef.current.prev();
    }
  }

  function handleNext() {
    if (viewRef.current) {
      viewRef.current.next();
    }
  }

  function handleBack() {
    // 先标记为已销毁，停止所有异步操作
    destroyedRef.current = true;
    saveNow();
    
    // 清理 view
    const view = viewRef.current;
    viewRef.current = null;
    if (view) {
      try {
        if (view.parentNode) {
          view.parentNode.removeChild(view);
        }
        view.close?.();
      } catch {}
    }
    
    // 清理容器
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }
    
    // 导航回书架
    router.push('/shelf');
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'Escape') handleBack();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (authLoading || !isAuthenticated) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900">
        <div className="text-lg text-slate-400">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-900 gap-4">
        <div className="text-lg text-red-400">{error}</div>
        <Button onClick={handleBack}>Back to Shelf</Button>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-900 flex flex-col overflow-hidden">
      <header className="border-b border-slate-800 bg-slate-900/95 backdrop-blur shrink-0 z-50">
        <div className="px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Tooltip>
              <TooltipTrigger onClick={handleBack} className="text-slate-300 hover:text-slate-100 text-sm px-3 py-1 rounded hover:bg-slate-800 cursor-pointer">
                ← Back
              </TooltipTrigger>
              <TooltipContent>Return to bookshelf</TooltipContent>
            </Tooltip>
            <div className="text-sm">
              <span className="text-slate-400">{metadata.title || 'Loading...'}</span>
              {currentChapter && (
                <span className="text-slate-500 ml-2">• {currentChapter}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Progress value={percentage} className="w-24 h-2" />
            <span className="text-xs text-slate-400 w-8">{percentage}%</span>

            <Sheet>
              <SheetTrigger className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors cursor-pointer">
                TOC
              </SheetTrigger>
              <SheetContent side="left" className="w-80 bg-slate-900 border-slate-800">
                <SheetHeader>
                  <SheetTitle className="text-slate-100">Table of Contents</SheetTitle>
                </SheetHeader>
                <Separator className="my-4" />
                <ScrollArea className="h-[calc(100vh-100px)]">
                  <div className="space-y-1">
                    {toc.length > 0 ? (
                      toc.map((item, idx) => (
                        <TOCNode key={idx} item={item} onGoTo={goTo} />
                      ))
                    ) : (
                      <div className="text-slate-500 text-sm">No table of contents</div>
                    )}
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>

            <Tooltip>
              <TooltipTrigger onClick={logout} className="text-slate-300 hover:text-slate-100 text-sm px-3 py-1 rounded hover:bg-slate-800 cursor-pointer">
                Logout
              </TooltipTrigger>
              <TooltipContent>Sign out</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </header>

      <div className="flex-1 relative min-h-0">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-10">
            <div className="text-lg text-slate-400">{loadingMsg}</div>
          </div>
        )}
        <div ref={containerRef} className="absolute inset-0" />

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-20">
          <Tooltip>
            <TooltipTrigger onClick={handlePrev} className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors cursor-pointer">
              ←
            </TooltipTrigger>
            <TooltipContent>Previous page</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger onClick={handleNext} className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors cursor-pointer">
              →
            </TooltipTrigger>
            <TooltipContent>Next page</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

function TOCNode({ item, onGoTo, depth = 0 }: { item: TOCItem; onGoTo: (href: string) => void; depth?: number }) {
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-slate-300 hover:text-slate-100 hover:bg-slate-800"
        style={{ paddingLeft: depth > 0 ? `${depth * 16 + 12}px` : '12px' }}
        onClick={() => onGoTo(item.href)}
      >
        {item.label}
      </Button>
      {item.subitems?.map((sub, idx) => (
        <TOCNode key={idx} item={sub} onGoTo={onGoTo} depth={depth + 1} />
      ))}
    </div>
  );
}