'use client';

import { useEffect } from 'react';

export function ErrorSuppressor() {
  useEffect(() => {
    const originalError = window.onerror;
    
    window.onerror = (message, source, lineno, colno, error) => {
      // 忽略 foliate 相关的 documentElement 错误和 this.document is null 错误
      if (typeof message === 'string' && 
          (message.includes('documentElement') || message.includes('this.document'))) {
        return true;
      }
      return originalError?.(message, source, lineno, colno, error) ?? false;
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      if (event.reason?.message?.includes('documentElement') || 
          event.reason?.message?.includes('this.document')) {
        event.preventDefault();
      }
    };
    
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.onerror = originalError;
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}