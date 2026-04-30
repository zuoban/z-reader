'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, Eye, EyeOff, LockKeyhole, MoveRight, UserRound } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AppScreen, BrandMark, LoadingSpinner, LoadingState } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      if (!password) setPasswordError('请输入访问密码');
      return;
    }

    setIsSubmitting(true);

    try {
      await login(trimmedUsername, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    }

    setIsSubmitting(false);
  }

  if (isLoading) {
    return (
      <AppScreen ambient="login">
        <LoadingState title="加载中..." />
      </AppScreen>
    );
  }

  return (
    <AppScreen ambient="login">
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-5 py-6 sm:px-7 sm:py-10 lg:px-10 lg:py-12">
        <div className="editorial-panel paper-stack w-full max-w-[460px] rounded-[2.25rem] px-6 py-8 sm:px-10 sm:py-10">
          <div className="editorial-divider mb-8 flex flex-col items-center gap-5 pb-8">
            <BrandMark size="lg" priority />
            <div className="text-center">
              <p className="text-[11px] font-semibold tracking-[0.24em] text-muted-foreground uppercase">
                Your Reading Room
              </p>
              <h1 className="font-heading text-[2rem] font-semibold tracking-[-0.04em] text-foreground sm:text-[2.4rem]">
                欢迎回来
              </h1>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="group space-y-2">
              <Label
                htmlFor="username"
                className="flex items-center gap-1.5 text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase transition-colors group-focus-within:text-foreground"
              >
                <UserRound className="h-3.5 w-3.5 opacity-60" />
                用户名
              </Label>
              <Input
                id="username"
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
                className="paper-control h-[52px] rounded-2xl px-4 text-sm shadow-none transition-all duration-200 placeholder:text-muted-foreground/55 focus:border-primary/45 focus:bg-background/65 focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
              {usernameError && (
                <p id="username-error" className="px-1 text-xs font-medium text-destructive">
                  {usernameError}
                </p>
              )}
            </div>

            <div className="group space-y-2">
              <Label
                htmlFor="password"
                className="flex items-center gap-1.5 text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase transition-colors group-focus-within:text-foreground"
              >
                <LockKeyhole className="h-3.5 w-3.5 opacity-60" />
                密码
              </Label>
              <div className="relative">
                <Input
                  id="password"
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
                  className="paper-control h-[52px] rounded-2xl px-4 pr-12 text-sm shadow-none transition-all duration-200 placeholder:text-muted-foreground/55 focus:border-primary/45 focus:bg-background/65 focus:outline-none focus:ring-2 focus:ring-primary/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-xl text-muted-foreground/55 transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  title={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {passwordError && (
                <p id="password-error" className="px-1 text-xs font-medium text-destructive">
                  {passwordError}
                </p>
              )}
            </div>

            {error && (
              <div className="animate-in slide-in-from-top-2 fade-in duration-300">
                <p className="paper-field flex items-center gap-2 rounded-2xl border border-destructive/20 bg-destructive/4 px-4 py-3 text-sm text-destructive">
                  <CircleAlert className="h-4 w-4 flex-shrink-0" />
                  {error}
                </p>
              </div>
            )}

            <Button
              type="submit"
              className="group relative h-[52px] w-full overflow-hidden rounded-2xl bg-primary text-sm font-semibold tracking-[0.06em] text-primary-foreground shadow-[0_24px_38px_-24px_var(--paper-shadow)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/92 hover:shadow-[0_28px_44px_-24px_var(--paper-shadow)] disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isSubmitting}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {isSubmitting ? (
                  <>
                    <LoadingSpinner inverted className="h-4 w-4 border-background/30" />
                    验证中
                  </>
                ) : (
                  <>
                    进入
                    <MoveRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </>
                )}
              </span>
            </Button>
          </form>

        </div>
      </div>
    </AppScreen>
  );
}
