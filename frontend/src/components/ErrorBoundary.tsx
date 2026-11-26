'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
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

  componentDidCatch(error: Error) {
    reportClientError(error, 'ErrorBoundary');
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
        <div className="flex min-h-[60dvh] flex-col items-center justify-center pl-[max(1.5rem,env(safe-area-inset-left,0px))] pr-[max(1.5rem,env(safe-area-inset-right,0px))] pt-[max(1.5rem,env(safe-area-inset-top,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] text-center">
          <div
            role="alert"
            className="paper-panel w-full max-w-md rounded-3xl px-6 py-10 sm:px-8"
          >
            <div className="mx-auto mb-5 flex h-13 w-13 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive">
              <AlertTriangle className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <h2 className="font-heading text-xl font-medium text-foreground sm:text-2xl">
              页面出现了问题
            </h2>
            <p className="mx-auto mt-2.5 max-w-sm text-sm leading-6 text-muted-foreground">
              页面遇到意外错误，请重试或刷新。如果问题持续，请联系管理员。
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="app-secondary-link min-w-[6.5rem] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                重试
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="app-primary-link min-w-[6.5rem] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                刷新页面
              </button>
            </div>
            <div className="mt-4">
              <a
                href="/shelf"
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                <span>返回书架</span>
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
