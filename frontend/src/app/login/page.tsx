'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated, login } = useAuth();
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
      await login(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }

    setIsSubmitting(false);
  }

  if (isLoading) {
    return (
      <div className="min-h-screen warm-gradient paper-texture flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-foreground/20"
            style={{ borderTopColor: 'var(--foreground)' }}
          />
          <p className="text-sm font-medium text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen warm-gradient paper-texture">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-20 h-44 w-44 -translate-x-1/2 rounded-full bg-accent/[0.06] blur-3xl" />
        <div className="absolute left-10 top-1/3 h-24 w-24 rounded-full bg-foreground/[0.04] blur-3xl" />
        <div className="absolute bottom-16 right-12 h-32 w-32 rounded-full bg-accent/[0.04] blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-5 py-6 sm:px-7 sm:py-7 lg:px-10 lg:py-9">
        <div className="w-full max-w-[440px] rounded-2xl border border-border/70 bg-background/95 px-7 py-8 shadow-[0_40px_120px_-72px_rgba(15,23,42,0.45)] backdrop-blur-sm sm:px-10 sm:py-10">
          <div className="mb-8 flex flex-col items-center gap-6">
            <div className="rounded-2xl border border-border/70 bg-background px-4 py-3 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.35)]">
              <Image
                src="/icons/logo-wordmark.svg"
                alt="Z Reader"
                width={216}
                height={66}
                className="h-auto w-[180px] sm:w-[216px]"
                priority
              />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              登录
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="group space-y-2">
              <Label
                htmlFor="password"
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors group-focus-within:text-foreground"
              >
                <svg className="h-3.5 w-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                密码
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入访问密码"
                  autoFocus
                  className="h-12 rounded-xl border-border/70 bg-background px-4 pr-10 text-sm shadow-none transition-all duration-300 placeholder:text-muted-foreground/50 focus:border-foreground/20 focus:bg-background focus:outline-none focus:ring-2 focus:ring-foreground/8"
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
                <p className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4M12 16h.01" />
                  </svg>
                  {error}
                </p>
              </div>
            )}

            <Button
              type="submit"
              className="group relative h-12 w-full overflow-hidden rounded-xl bg-foreground text-sm font-medium text-background shadow-[0_18px_30px_-22px_rgba(15,23,42,0.45)] transition-all duration-300 hover:bg-foreground/92 hover:shadow-[0_22px_40px_-24px_rgba(15,23,42,0.5)] disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isSubmitting}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {isSubmitting ? (
                  <>
                    <div
                      className="h-4 w-4 animate-spin rounded-full border-2 border-background/30"
                      style={{ borderTopColor: 'var(--background)' }}
                    />
                    验证中
                  </>
                ) : (
                  <>
                    进入
                    <svg className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </>
                )}
              </span>
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
