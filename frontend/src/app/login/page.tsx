'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, LockKeyhole, MoveRight, UserRound } from 'lucide-react';
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
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/shelf');
    }
  }, [isLoading, isAuthenticated, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login(username, password);
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
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-5 py-6 sm:px-7 sm:py-7 lg:px-10 lg:py-9">
        <div className="w-full max-w-[440px] rounded-lg border border-border/80 bg-card/96 px-6 py-7 shadow-[0_28px_80px_-58px_rgba(15,23,42,0.38)] backdrop-blur-sm sm:px-9 sm:py-9">
          <div className="mb-7 flex flex-col items-center gap-5">
            <BrandMark size="lg" framed priority />
            <div className="text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                欢迎回来
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                进入书架，继续上次的阅读进度
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="group space-y-2">
              <Label
                htmlFor="username"
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors group-focus-within:text-foreground"
              >
                <UserRound className="h-3.5 w-3.5 opacity-60" />
                用户名
              </Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
                autoComplete="username"
                autoFocus
                className="h-12 rounded-lg border-border/80 bg-background px-4 text-sm shadow-none transition-all duration-200 placeholder:text-muted-foreground/55 focus:border-primary/45 focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </div>

            <div className="group space-y-2">
              <Label
                htmlFor="password"
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors group-focus-within:text-foreground"
              >
                <LockKeyhole className="h-3.5 w-3.5 opacity-60" />
                密码
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入访问密码"
                  autoComplete="current-password"
                  className="h-12 rounded-lg border-border/80 bg-background px-4 pr-10 text-sm shadow-none transition-all duration-200 placeholder:text-muted-foreground/55 focus:border-primary/45 focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/15"
                />
                <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 transition-opacity duration-300 group-focus-within:opacity-80">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.3" />
                  </svg>
                </div>
              </div>
            </div>

            {error && (
              <div className="animate-in slide-in-from-top-2 fade-in duration-300">
                <p className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  <CircleAlert className="h-4 w-4 flex-shrink-0" />
                  {error}
                </p>
              </div>
            )}

            <Button
              type="submit"
              className="group relative h-12 w-full overflow-hidden rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-[0_18px_30px_-22px_rgba(15,23,42,0.45)] transition-all duration-200 hover:bg-primary/92 hover:shadow-[0_22px_40px_-24px_rgba(15,23,42,0.5)] disabled:cursor-not-allowed disabled:opacity-70"
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
