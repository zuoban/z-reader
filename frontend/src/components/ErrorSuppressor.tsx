'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/error-reporting';

const IGNORED_ERROR_PATTERNS = [
  'documentElement',
  'this.document',
  'ResizeObserver loop completed with undelivered notifications',
  'ResizeObserver loop limit exceeded',
];

function isIgnoredClientError(message: unknown, error?: unknown): boolean {
  const candidates = [
    typeof message === 'string' ? message : '',
    error instanceof Error ? error.message : typeof error === 'string' ? error : '',
  ];
  return candidates.some((text) =>
    IGNORED_ERROR_PATTERNS.some((pattern) => text.includes(pattern))
  );
}

export function ErrorSuppressor() {
  useEffect(() => {
    const originalError = window.onerror;

    window.onerror = (message, source, lineno, colno, error) => {
      // 忽略 foliate 相关的 documentElement / this.document 错误及浏览器良性 ResizeObserver 循环提示
      if (isIgnoredClientError(message, error)) {
        return true;
      }
      reportClientError(error ?? message, 'window.onerror');
      return originalError?.(message, source, lineno, colno, error) ?? false;
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      if (isIgnoredClientError(event.reason?.message, event.reason)) {
        event.preventDefault();
        return;
      }
      reportClientError(event.reason, 'unhandledrejection');
    };
    
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.onerror = originalError;
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}
