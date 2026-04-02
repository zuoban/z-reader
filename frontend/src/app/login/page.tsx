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
      {/* 装饰性背景元素 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-1/4 h-64 w-64 rounded-full bg-accent/5 blur-3xl" />
        <div className="absolute -right-32 bottom-1/4 h-64 w-64 rounded-full bg-accent/5 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.03] blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-[720px] items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="w-full overflow-hidden rounded-[2.5rem] border border-border/50 bg-background/85 shadow-[0_40px_120px_-60px_rgba(15,23,42,0.5)] backdrop-blur-2xl">
          {/* 顶部装饰区域 */}
          <section className="relative overflow-hidden border-b border-border/30 bg-gradient-to-b from-card/60 to-card/30 px-6 py-5 sm:px-8 sm:py-6 lg:px-10 lg:py-6">
            {/* 渐变叠加层 */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.4),transparent_50%),radial-gradient(ellipse_at_bottom,rgba(212,175,55,0.08),transparent_40%)]" />

            {/* 浮动光斑 - 减少动画时长并使用标准 Tailwind 值 */}
            <div className="pointer-events-none absolute left-8 top-4 h-20 w-20 rounded-full border border-accent/20 bg-accent/10 blur-2xl" />
            <div className="pointer-events-none absolute right-12 bottom-6 h-16 w-16 rounded-full border border-accent/15 bg-accent/8 blur-2xl" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25 bg-white/5 blur-3xl" />

            <div className="relative flex h-full items-center justify-center">
              <div className="w-full max-w-[300px] text-center">
                {/* Logo 光晕背景 */}
                <div className="relative mx-auto mb-2 flex justify-center">
                  <div className="pointer-events-none absolute inset-x-8 top-1/2 h-20 -translate-y-1/2 rounded-full bg-accent/10 blur-3xl" />

                  {/* Logo 容器 */}
                  <div className="motion-safe:animate-login-float relative w-[130px] sm:w-[148px] lg:w-[164px]">
                    {/* 外发光层 */}
                    <div className="absolute inset-0 rounded-[26px] border border-white/35 bg-gradient-to-br from-white/15 to-white/5 blur-2xl transition-opacity duration-500" />

                    <div className="relative">
                      <svg
                        viewBox="0 0 320 280"
                        className="h-auto w-full drop-shadow-lg dark:drop-shadow-xl"
                        aria-hidden="true"
                      >
                        <defs>
                          <linearGradient id="login-card" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
                            <stop offset="100%" stopColor="rgba(255,255,255,0.6)" />
                          </linearGradient>
                          <linearGradient id="login-book" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
                            <stop offset="100%" stopColor="rgba(255,255,255,0.7)" />
                          </linearGradient>
                          <linearGradient id="accent-glow" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="rgba(212,175,55,0.4)" />
                            <stop offset="100%" stopColor="rgba(212,175,55,0.1)" />
                          </linearGradient>
                        </defs>

                        {/* 背景装饰圆 - 深色模式增加不透明度 */}
                        <circle cx="82" cy="62" r="42" fill="rgba(212,175,55,0.12)" className="dark:opacity-80" />
                        <circle cx="248" cy="214" r="58" fill="rgba(212,175,55,0.1)" className="dark:opacity-80" />

                        {/* 卡片主体 */}
                        <rect x="70" y="54" width="180" height="150" rx="30" fill="url(#login-card)" stroke="rgba(23,23,23,0.15)" strokeWidth="1.5" />

                        {/* 卡片顶部高光 - 深色模式调整 */}
                        <rect x="70" y="54" width="180" height="40" rx="30" fill="rgba(255,255,255,0.2)" className="dark:fill-white/25" style={{ clipPath: 'inset(0 0 50% 0 round 30px)' }} />

                        {/* 书本封面 */}
                        <rect x="96" y="78" width="128" height="112" rx="22" fill="url(#login-book)" stroke="rgba(23,23,23,0.12)" strokeWidth="1" />

                        {/* 书本文字行 - 深色模式增加对比度 */}
                        <path d="M112 97h68" stroke="rgba(23,23,23,0.18)" className="dark:stroke-white/20" strokeWidth="6" strokeLinecap="round" />
                        <path d="M112 117h96" stroke="rgba(23,23,23,0.14)" className="dark:stroke-white/16" strokeWidth="5" strokeLinecap="round" />
                        <path d="M112 136h78" stroke="rgba(23,23,23,0.14)" className="dark:stroke-white/16" strokeWidth="5" strokeLinecap="round" />
                        <path d="M112 155h88" stroke="rgba(23,23,23,0.14)" className="dark:stroke-white/16" strokeWidth="5" strokeLinecap="round" />

                        {/* 书签带 - 深色模式增强金色 */}
                        <rect x="210" y="88" width="12" height="44" rx="6" fill="url(#accent-glow)" stroke="rgba(212,175,55,0.5)" strokeWidth="1" />
                        <path d="M216 132v18l-8-5-8 5v-18" fill="rgba(212,175,55,0.2)" className="dark:fill-amber-400/25" stroke="rgba(212,175,55,0.35)" strokeWidth="0.5" />

                        {/* 底部标签 - 深色模式增强 */}
                        <rect x="128" y="182" width="64" height="16" rx="8" fill="rgba(212,175,55,0.3)" className="dark:fill-amber-400/30" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* 品牌标识 - 更精致的设计 */}
                <div className="relative mx-auto mt-3 flex w-fit items-center gap-2 rounded-full border border-border/40 bg-background/50 px-4 py-1.5 text-xs font-medium tracking-[0.12em] text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] backdrop-blur-sm">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent/60" />
                  Z READER
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent/60" />
                </div>
              </div>
            </div>
          </section>

          {/* 表单区域 */}
          <section className="relative bg-background/80 px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-10">
            {/* 顶部渐变分隔 */}
            <div className="absolute left-1/2 top-0 h-[1px] w-24 -translate-x-1/2 bg-gradient-to-r from-transparent via-accent/30 to-transparent" />

            <div className="relative mx-auto w-full max-w-[400px]">
              <div className="mb-8 text-center">
                <h2 className="bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
                  进入书库
                </h2>
                <p className="mt-1.5 text-xs text-muted-foreground">
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
                      className="h-12 rounded-2xl border-border/60 bg-card/60 px-4 pr-10 text-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] transition-all duration-300 placeholder:text-muted-foreground/50 focus:border-accent/50 focus:bg-card/80 focus:shadow-[inset_0_2px_8px_rgba(0,0,0,0.04)] focus:outline-none focus:ring-2 focus:ring-accent/20"
                    />
                    {/* 输入框右侧图标 */}
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
                    <p className="flex items-center gap-2 rounded-2xl border border-destructive/25 bg-destructive/6 px-4 py-3 text-sm text-destructive">
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
                  className="group relative h-12 w-full overflow-hidden rounded-2xl bg-gradient-to-b from-foreground to-foreground/90 text-sm font-medium text-background shadow-[0_8px_24px_-8px_rgba(0,0,0,0.3)] transition-all duration-300 hover:shadow-[0_12px_32px_-10px_rgba(0,0,0,0.35)] disabled:cursor-not-allowed disabled:opacity-70"
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
                  {/* 按钮悬停光效 - 简化以提升性能 */}
                  <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                </Button>
              </form>

              {/* 底部提示 */}
              <div className="mt-6 text-center">
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
