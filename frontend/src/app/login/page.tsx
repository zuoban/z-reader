'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, PasswordInput } from '@mantine/core';
import { ArrowUpRight, CircleAlert, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AppScreen, BrandLogo, LoadingSpinner, LoadingState } from '@/components/AppShell';
import { LibraryPreview } from '@/components/LibraryPreview';

export default function LoginPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated, login } = useAuth({ redirectOnExpire: false });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/shelf');
    }
  }, [isLoading, isAuthenticated, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setPasswordError('');
    if (!password) {
      setPasswordError('请输入访问密码');
      passwordRef.current?.focus();
      return;
    }

    setIsSubmitting(true);

    try {
      await login(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    }

    setIsSubmitting(false);
  }

  if (isLoading || isAuthenticated) {
    return (
      <AppScreen>
        <LoadingState title="加载中..." />
      </AppScreen>
    );
  }

  return (
    <AppScreen contentClassName="entry-screen flex flex-col">
      <div className="app-container flex flex-1 flex-col items-center lg:justify-center lg:py-8">
        <header className="flex w-full max-w-5xl items-center justify-between gap-4 border-b border-border py-3 lg:mb-5 lg:border-0 lg:py-0">
          <Link href="/" aria-label="Z Reader 首页" className="inline-flex min-h-10 items-center rounded-lg">
            <BrandLogo compact />
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
          >
            返回首页
            <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </header>
        <main className="auth-layout mt-12 sm:mt-16 lg:mt-0">
          <aside className="auth-editorial">
            <div>
              <h2 className="max-w-[10em] text-balance font-heading text-[clamp(1.875rem,3vw,2.625rem)] font-medium leading-[1.3]">
                私人书库，随时续读
              </h2>
              <p className="auth-editorial-copy mt-4 max-w-[23em] text-pretty text-[15px] leading-7">
                你的电子书、书签与阅读进度保存在同一处，打开就能接着看
              </p>
            </div>
            <LibraryPreview compact />
          </aside>
          <div className="auth-form-panel">
            <div className="mb-8">
              <h1 className="font-heading text-3xl font-medium leading-tight lg:text-[2.125rem]">
                欢迎回来
              </h1>
              <p className="mt-2.5 text-sm leading-6 text-muted-foreground">
                输入访问密码继续阅读
              </p>
            </div>

            <form onSubmit={handleSubmit} className="w-full space-y-5">
              <PasswordInput
                id="password"
                ref={passwordRef}
                label="访问密码"
                value={password}
                onChange={(e) => {
                  setPassword(e.currentTarget.value);
                  if (passwordError) setPasswordError('');
                }}
                visible={showPassword}
                onVisibilityChange={setShowPassword}
                placeholder="请输入访问密码"
                autoComplete="current-password"
                aria-invalid={Boolean(passwordError)}
                aria-describedby={passwordError ? 'password-error' : undefined}
                error={passwordError || undefined}
                errorProps={{ id: 'password-error', role: 'alert' }}
                visibilityToggleIcon={({ reveal }) =>
                  reveal ? (
                    <EyeOff size={16} strokeWidth={1.5} />
                  ) : (
                    <Eye size={16} strokeWidth={1.5} />
                  )
                }
                visibilityToggleButtonProps={{
                  'aria-label': showPassword ? '隐藏密码' : '显示密码',
                  className:
                    'h-10 w-10 rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-offset-[-3px] sm:h-9 sm:w-9',
                }}
                classNames={{
                  label: 'mb-2 text-sm font-medium text-foreground',
                  input:
                    'app-field h-11 w-full rounded-lg border border-border bg-card shadow-none focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/12 sm:h-10',
                  innerInput:
                    'h-full pl-3.5 pr-11 text-base text-foreground placeholder:text-muted-foreground sm:text-sm',
                  section: 'w-11 sm:w-10',
                  error: 'mt-2 text-xs font-medium text-destructive',
                }}
              />

              {error && (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
                >
                  <CircleAlert size={16} className="shrink-0" aria-hidden="true" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                variant="filled"
                fullWidth
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className="app-primary-link min-h-11 w-full rounded-lg sm:min-h-10 disabled:cursor-not-allowed disabled:opacity-50"
                classNames={{
                  label: 'inline-flex items-center justify-center gap-2',
                }}
              >
                {isSubmitting ? (
                  <>
                    <LoadingSpinner className="h-4 w-4 border-primary-foreground/25 border-t-primary-foreground" />
                    正在进入...
                  </>
                ) : (
                  '进入书架'
                )}
              </Button>
            </form>
          </div>
        </main>
        <footer className="pt-8 pb-6 text-center text-xs text-muted-foreground lg:pt-5 lg:pb-0">
          Z Reader · 私人书库
        </footer>
      </div>
    </AppScreen>
  );
}
