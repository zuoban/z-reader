'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AppScreen, BrandLogo, LoadingSpinner, LoadingState } from '@/components/AppShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated, login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
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
      if (!password) setPasswordError(mode === 'register' ? '请输入密码' : '请输入访问密码');
      return;
    }

    if (mode === 'register' && password.length < 8) {
      setPasswordError('密码至少需要 8 个字符');
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
      contentClassName="flex min-h-dvh flex-col items-center justify-center px-5 py-10"
    >
      <div className="w-full max-w-[420px] rounded-2xl border border-border/65 bg-card/76 px-5 py-8 shadow-[0_24px_70px_-54px_var(--paper-shadow),inset_0_1px_0_color-mix(in_srgb,var(--glass-specular)_46%,transparent)] backdrop-blur sm:px-8 sm:py-10">
        <div className="mb-12 flex flex-col items-center">
          <BrandLogo className="mb-4 scale-110" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {mode === 'register' ? '创建账号' : '欢迎回来'}
          </h1>
          <p className="text-[17px] font-medium text-muted-foreground">
            {mode === 'register' ? '创建您的阅读账号' : '登录到您的书库'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="w-full space-y-6">
          <div className="space-y-2">
            <Label
              htmlFor="username"
              className="text-sm font-bold text-foreground"
            >
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
              className="h-12 w-full rounded-xl border border-border/55 bg-shelf-surface-soft px-4 text-base shadow-none transition-all placeholder:text-muted-foreground/55 focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/15"
            />
            {usernameError && (
              <p className="text-xs font-medium text-red-500">
                {usernameError}
              </p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label
              htmlFor="password"
              className="text-sm font-bold text-foreground"
            >
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
                placeholder="请输入您的密码"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                className="h-12 w-full rounded-xl border border-border/55 bg-shelf-surface-soft px-4 pr-12 text-base shadow-none transition-all placeholder:text-muted-foreground/55 focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/15"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {passwordError && (
              <p className="text-xs font-medium text-red-500">
                {passwordError}
              </p>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <CircleAlert size={16} />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          >
            {isSubmitting ? (
              <div className="flex items-center justify-center gap-2">
                <LoadingSpinner className="h-4 w-4 border-primary-foreground/20 border-t-primary-foreground" />
                {mode === 'register' ? '正在创建...' : '正在登录...'}
              </div>
            ) : (
              mode === 'register' ? '创建并进入书架' : '进入书架'
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground">
            {mode === 'register' ? '已经有账号？' : '还没有账号？'}{' '}
            <button
              type="button"
              onClick={() => switchMode(mode === 'register' ? 'login' : 'register')}
              className="cursor-pointer font-bold text-foreground hover:underline"
            >
              {mode === 'register' ? '返回登录' : '立即创建'}
            </button>
          </p>
        </div>
      </div>
    </AppScreen>
  );
}
