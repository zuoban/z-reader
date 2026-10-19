'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CircleAlert, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AppScreen, BrandLogo, LoadingSpinner, LoadingState } from '@/components/AppShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LibraryPreview } from '@/components/LibraryPreview';

export default function LoginPage() {
  return (
    <Suspense
      fallback={(
        <AppScreen ambient="login">
          <LoadingState title="加载中..." />
        </AppScreen>
      )}
    >
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading, isAuthenticated, login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(
    searchParams.get('mode') === 'register' ? 'register' : 'login'
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/shelf');
    }
  }, [isLoading, isAuthenticated, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setUsernameError('');
    setPasswordError('');

    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      if (!trimmedUsername) setUsernameError('请输入用户名');
      if (!password) setPasswordError(mode === 'register' ? '请输入密码' : '请输入访问密码');
      requestAnimationFrame(() => {
        (!trimmedUsername ? usernameRef : passwordRef).current?.focus();
      });
      return;
    }

    if (mode === 'register' && password.length < 8) {
      setPasswordError('密码至少需要 8 个字符');
      requestAnimationFrame(() => passwordRef.current?.focus());
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === 'register') {
        await register(trimmedUsername, password);
      } else {
        await login(trimmedUsername, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : mode === 'register' ? '注册失败' : '登录失败');
    }

    setIsSubmitting(false);
  }

  function switchMode(nextMode: 'login' | 'register') {
    setMode(nextMode);
    setError('');
    setUsernameError('');
    setPasswordError('');
  }

  if (isLoading) {
    return (
      <AppScreen ambient="login">
        <LoadingState title="加载中..." />
      </AppScreen>
    );
  }

  return (
    <AppScreen
      ambient="login"
      className="bg-background text-foreground"
      contentClassName="flex min-h-dvh flex-col items-center justify-center px-5 py-8 sm:px-8 sm:py-10"
    >
      <div className="mb-7 flex w-full max-w-5xl items-center justify-between">
        <Link href="/" aria-label="Z Reader 首页" className="rounded-sm">
          <BrandLogo />
        </Link>
        <Link href="/" className="py-2 text-xs text-muted-foreground hover:text-primary">
          返回首页 ↗
        </Link>
      </div>
      <main className="auth-layout">
        <aside className="auth-editorial">
          <div>
            <p className="app-eyebrow">Your reading corner</p>
            <h2 className="mt-4 font-heading text-3xl font-semibold leading-relaxed">
              书在这里，<br />故事继续。
            </h2>
            <p className="mb-8 mt-3 text-sm leading-7 text-muted-foreground">
              把世界的喧嚣留在外面，<br />在自己的书房，读自己喜欢的书。
            </p>
          </div>
          <LibraryPreview compact />
        </aside>
        <div className="auth-form-panel flex flex-col justify-center">
          <div className="mb-8">
            <p className="app-eyebrow mb-3">{mode === 'register' ? 'A new chapter' : 'Welcome back'}</p>
            <h1 className="font-heading text-3xl font-semibold tracking-[-0.03em] text-foreground">
              {mode === 'register' ? '创建账号' : '欢迎回来'}
            </h1>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              {mode === 'register' ? '创建您的阅读账号，开启私有书库' : '登录到您的书库，继续阅读'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="w-full space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-semibold text-foreground">
                用户名
              </Label>
              <Input
                id="username"
                ref={usernameRef}
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (usernameError) setUsernameError('');
                }}
                placeholder="请输入用户名"
                autoComplete="username"
                autoFocus
                aria-invalid={Boolean(usernameError)}
                aria-describedby={usernameError ? 'username-error' : undefined}
                className="app-field w-full px-4"
              />
              {usernameError && (
                <p id="username-error" className="text-xs font-medium text-destructive" role="alert">
                  {usernameError}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold text-foreground">
                密码
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
                  placeholder="请输入您的密码"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={passwordError ? 'password-error' : undefined}
                  className="app-field w-full pl-4 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground sm:right-2 sm:h-9 sm:w-9"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
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
                className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                <CircleAlert size={16} className="shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className="app-primary-link w-full disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="flex items-center justify-center gap-2">
                  <LoadingSpinner className="h-4 w-4 border-primary-foreground/25 border-t-primary-foreground" />
                  {mode === 'register' ? '正在创建...' : '正在登录...'}
                </div>
              ) : mode === 'register' ? (
                '创建并进入书架'
              ) : (
                '进入书架'
              )}
            </button>
          </form>

          <div className="mt-8 border-t border-border pt-6 text-center">
            <p className="text-sm text-muted-foreground">
              {mode === 'register' ? '已经有账号？' : '还没有账号？'}{' '}
              <button
                type="button"
                onClick={() => switchMode(mode === 'register' ? 'login' : 'register')}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-sm font-semibold text-primary underline-offset-4 transition-colors hover:underline"
              >
                {mode === 'register' ? '返回登录' : '立即创建'}
              </button>
            </p>
          </div>
        </div>
      </main>
      <p className="mt-6 text-center text-xs tracking-wide text-muted-foreground">
        Z Reader · 一间属于你的数字书房
      </p>
    </AppScreen>
  );
}
