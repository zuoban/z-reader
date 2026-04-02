'use client';

import { useEffect, useState } from 'react';
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
        <div className="absolute left-1/2 top-24 h-40 w-40 -translate-x-1/2 rounded-full bg-accent/[0.05] blur-3xl" />
        <div className="absolute right-12 top-1/3 h-32 w-32 rounded-full bg-foreground/[0.03] blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-5 py-6 sm:px-7 sm:py-7 lg:px-10 lg:py-9">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-[32px] border border-border/70 bg-background shadow-[0_40px_120px_-72px_rgba(15,23,42,0.45)] lg:grid-cols-[1.05fr_0.95fr]">
          <section className="relative border-b border-border/70 px-7 py-10 sm:px-10 sm:py-12 lg:border-b-0 lg:border-r lg:px-12 lg:py-14">
            <div className="flex h-full flex-col justify-between gap-10">
              <div>
                <div className="flex w-fit items-center gap-2 rounded-full border border-border/70 bg-muted/50 px-3.5 py-1.5 text-[11px] font-medium tracking-[0.14em] text-muted-foreground">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent/70" />
                  Z READER
                </div>

                <div className="mt-8 max-w-md">
                  <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                    安静地整理你的电子藏书
                  </h1>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
                    一个更专注的 EPUB 阅读空间，保留干净书架、顺畅阅读和私密访问。
                  </p>
                </div>
              </div>

              <div className="relative max-w-[360px]">
                <div className="absolute inset-0 rounded-[30px] bg-accent/[0.06] blur-3xl" />
                <div className="relative rounded-[28px] border border-border/70 bg-muted/30 p-5 shadow-[0_24px_50px_-40px_rgba(15,23,42,0.35)]">
                  <div className="rounded-[22px] border border-border/70 bg-background p-4">
                    <div className="aspect-[0.78] rounded-[18px] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(245,245,245,0.9))] p-4">
                      <div className="flex h-full flex-col justify-between rounded-[14px] border border-border/50 bg-background px-4 py-5">
                        <div>
                          <div className="h-2.5 w-20 rounded-full bg-foreground/12" />
                          <div className="mt-3 h-2.5 w-28 rounded-full bg-foreground/9" />
                          <div className="mt-2 h-2.5 w-24 rounded-full bg-foreground/9" />
                        </div>
                        <div className="flex items-end justify-between">
                          <div className="h-16 w-12 rounded-xl bg-accent/18" />
                          <div className="h-10 w-10 rounded-full border border-border/60 bg-muted/60" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span>私人书架</span>
                    <span>EPUB Reader</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="relative px-7 py-10 sm:px-10 sm:py-12 lg:px-12 lg:py-14">
            <div className="relative mx-auto w-full max-w-[400px]">
              <div className="mb-8">
                <p className="text-xs font-medium tracking-[0.12em] text-muted-foreground">
                  MEMBER ACCESS
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                  进入书库
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  输入密码访问您的私人藏书
                </p>
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

              <div className="mt-6 border-t border-border/70 pt-5 text-center">
                <p className="text-xs text-muted-foreground">
                  首次访问？密码由管理员提供
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
