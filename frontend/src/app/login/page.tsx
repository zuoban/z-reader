'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, CircleAlert, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AppScreen, BrandLogo, LoadingSpinner, LoadingState } from '@/components/AppShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
        <header className="flex w-full max-w-6xl items-center justify-between gap-4 border-b border-border py-3 lg:mb-5 lg:border-0 lg:py-0">
          <Link href="/" aria-label="Z Reader 首页" className="inline-flex min-h-11 items-center rounded-lg">
            <BrandLogo />
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
          >
            返回首页
            <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </header>
        <main className="auth-layout mt-12 sm:mt-16 lg:mt-0">
          <aside className="auth-editorial">
            <div>
              <h2 className="max-w-[10em] text-balance font-heading text-[clamp(2rem,3.5vw,3rem)] font-semibold leading-[1.3]">
                私人书库，随时续读
              </h2>
              <p className="auth-editorial-copy mt-4 max-w-[23em] text-pretty text-[15px] leading-7">
                你的电子书、书签与阅读进度保存在同一处，打开就能接着看。
              </p>
            </div>
            <LibraryPreview compact />
          </aside>
          <div className="auth-form-panel">
            <div className="mb-8">
              <h1 className="font-heading text-4xl font-semibold leading-tight lg:text-[2.625rem]">
                欢迎回来
              </h1>
              <p className="mt-3 text-[15px] leading-6 text-muted-foreground">
                输入访问密码进入你的私人书库
              </p>
            </div>

            <form onSubmit={handleSubmit} className="w-full space-y-5">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-foreground">
                  访问密码
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (passwordError) setPasswordError('');
                    }}
                    placeholder="请输入访问密码"
                    autoComplete="current-password"
                    aria-invalid={Boolean(passwordError)}
                    aria-describedby={passwordError ? 'password-error' : undefined}
                    className="app-field h-12 w-full pl-3.5 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute inset-y-0 right-0.5 my-auto flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-offset-[-3px]"
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  >
                    {showPassword ? <EyeOff size={18} strokeWidth={1.5} /> : <Eye size={18} strokeWidth={1.5} />}
                  </button>
                </div>
                {passwordError && (
                  <p id="password-error" className="text-xs font-medium text-destructive" role="alert">
                    {passwordError}
                  </p>
                )}
              </div>

              {error && (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
                >
                  <CircleAlert size={16} className="shrink-0" aria-hidden="true" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className="app-primary-link min-h-12 w-full disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <LoadingSpinner className="h-4 w-4 border-primary-foreground/25 border-t-primary-foreground" />
                    正在进入...
                  </>
                ) : (
                  '进入书架'
                )}
              </button>
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
