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
    <div className="min-h-screen warm-gradient paper-texture">
      <div className="mx-auto flex min-h-screen w-full max-w-[680px] items-center px-4 py-6 sm:px-6 lg:px-8">
        <div className="w-full overflow-hidden rounded-[32px] border border-border/60 bg-background/78 shadow-[0_28px_90px_-48px_rgba(15,23,42,0.45)] backdrop-blur-xl">
          <section className="relative overflow-hidden border-b border-border/45 bg-card/70 px-5 py-3 sm:px-7 sm:py-4 lg:px-9 lg:py-4">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.32),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.06),transparent)]" />
            <div className="pointer-events-none absolute left-10 top-6 h-14 w-14 rounded-full border border-border/35 bg-background/18 blur-3xl" />
            <div className="pointer-events-none absolute bottom-4 right-10 h-18 w-18 rounded-full border border-border/25 bg-background/14 blur-3xl" />

            <div className="relative flex h-full items-center justify-center">
              <div className="w-full max-w-[280px] text-center">
                <div className="relative mx-auto flex justify-center">
                  <div className="pointer-events-none absolute inset-x-12 top-1/2 h-16 -translate-y-1/2 rounded-full bg-background/24 blur-3xl" />
                  <div className="motion-safe:animate-login-float relative w-[120px] sm:w-[136px] lg:w-[150px]">
                    <div className="absolute inset-0 rounded-[22px] border border-white/30 bg-white/10 blur-2xl" />
                    <div className="relative">
                      <svg
                        viewBox="0 0 320 280"
                        className="h-auto w-full"
                        aria-hidden="true"
                      >
                        <defs>
                          <linearGradient id="login-card" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
                            <stop offset="100%" stopColor="rgba(255,255,255,0.55)" />
                          </linearGradient>
                          <linearGradient id="login-book" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="rgba(255,255,255,0.92)" />
                            <stop offset="100%" stopColor="rgba(255,255,255,0.65)" />
                          </linearGradient>
                        </defs>

                        <circle cx="82" cy="62" r="42" fill="rgba(255,255,255,0.14)" />
                        <circle cx="248" cy="214" r="58" fill="rgba(255,255,255,0.1)" />

                        <rect x="70" y="54" width="180" height="150" rx="30" fill="url(#login-card)" stroke="rgba(23,23,23,0.12)" />
                        <rect x="96" y="78" width="128" height="112" rx="22" fill="url(#login-book)" stroke="rgba(23,23,23,0.1)" />

                        <path d="M112 97h68" stroke="rgba(23,23,23,0.16)" strokeWidth="8" strokeLinecap="round" />
                        <path d="M112 117h96" stroke="rgba(23,23,23,0.12)" strokeWidth="7" strokeLinecap="round" />
                        <path d="M112 136h78" stroke="rgba(23,23,23,0.12)" strokeWidth="7" strokeLinecap="round" />
                        <path d="M112 155h88" stroke="rgba(23,23,23,0.12)" strokeWidth="7" strokeLinecap="round" />

                        <rect x="210" y="88" width="12" height="44" rx="6" fill="rgba(23,23,23,0.12)" />
                        <path d="M216 132v18l-8-5-8 5v-18" fill="rgba(23,23,23,0.1)" />

                        <rect x="128" y="182" width="64" height="16" rx="8" fill="rgba(23,23,23,0.08)" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="mx-auto mt-2.5 flex w-fit items-center rounded-full border border-border/50 bg-background/66 px-2.5 py-0.5 text-[10px] text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
                  Z Reader
                </div>
              </div>
            </div>
          </section>

          <section className="bg-background/72 px-5 py-6 sm:px-7 sm:py-8 lg:px-10 lg:py-10">
            <div className="mx-auto w-full max-w-[420px]">
              <div className="mb-6">
                <h2 className="text-center text-2xl font-semibold tracking-tight text-foreground">
                  进入书库
                </h2>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">
                    密码
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="输入密码"
                    autoFocus
                    className="h-11 rounded-2xl border-border/70 bg-card/80 px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]"
                  />
                </div>

                {error && (
                  <p className="rounded-2xl border border-destructive/20 bg-destructive/8 px-3.5 py-3 text-sm text-destructive">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  className="h-11 w-full rounded-2xl bg-foreground text-background shadow-[0_16px_36px_-24px_rgba(15,23,42,0.8)] hover:bg-foreground/92"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <div
                        className="h-4 w-4 animate-spin rounded-full border-2 border-background/30"
                        style={{ borderTopColor: 'var(--background)' }}
                      />
                      验证中
                    </span>
                  ) : (
                    '进入'
                  )}
                </Button>
              </form>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
