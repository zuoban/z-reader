'use client';

import { Component, type ReactNode } from 'react';
import { reportClientError } from '@/lib/error-reporting';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    reportClientError(error, errorInfo.componentStack ?? 'ErrorBoundary');
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
          <div className="paper-panel paper-texture w-full max-w-md rounded-2xl px-6 py-10 sm:px-8">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-destructive/18 bg-destructive/10 text-destructive">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
            </div>
            <h2 className="font-heading text-2xl font-semibold tracking-[-0.02em] text-foreground">
              页面出现了问题
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              抱歉，页面遇到了意外错误。请尝试刷新页面，如果问题持续存在，请联系管理员。
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="h-11 rounded-xl border border-border/70 bg-card px-5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                重试
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_10px_24px_-18px_var(--paper-shadow)] transition-colors hover:opacity-92 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                刷新页面
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
