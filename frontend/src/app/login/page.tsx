'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, PasswordInput } from '@mantine/core';
import { ArrowLeft, CircleAlert, Eye, EyeOff } from 'lucide-react';
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
        <header className="flex h-14 w-full max-w-5xl items-center justify-between gap-4 border-b border-border sm:h-16 lg:mb-4 lg:h-auto lg:border-0">
          <Link href="/" aria-label="Z Reader 首页" className="entry-nav-link inline-flex">
            <BrandLogo compact />
          </Link>
          <Link href="/" className="entry-nav-link inline-flex">
            <ArrowLeft size={16} strokeWidth={1.5} aria-hidden="true" />
            返回首页
          </Link>
        </header>
        <main className="auth-layout mt-10 sm:mt-12 lg:mt-0">
          <aside className="auth-editorial">
            <div>
              <h2 className="entry-title text-2xl xl:text-[1.75rem]">
                私人书库，随时续读
              </h2>
              <p className="mt-3 max-w-[23em] text-pretty text-sm leading-6 text-muted-foreground">
                书籍、书签和阅读进度都保存在同一处
              </p>
            </div>
            <LibraryPreview compact />
          </aside>
          <div className="auth-form-panel">
            <div className="mb-8">
              <h1 className="entry-title text-[2rem] lg:text-4xl">
                解锁书库
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
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
                visibilityToggleFocusable
                placeholder="请输入访问密码"
                autoComplete="current-password"
                aria-invalid={Boolean(passwordError)}
                aria-describedby={passwordError ? 'password-error' : undefined}
                error={passwordError || undefined}
                errorProps={{ id: 'password-error', role: 'alert' }}
                visibilityToggleIcon={({ reveal }) =>
                  reveal ? (
                    <EyeOff size={16} strokeWidth={1.5} aria-hidden="true" />
                  ) : (
                    <Eye size={16} strokeWidth={1.5} aria-hidden="true" />
                  )
                }
                visibilityToggleButtonProps={{
                  'aria-label': showPassword ? '隐藏密码' : '显示密码',
                  className: 'entry-password-toggle',
                }}
                classNames={{
                  label: 'mb-2 text-sm font-medium text-foreground',
                  input: 'app-field entry-field',
                  innerInput: 'entry-password-input',
                  section: 'entry-password-section',
                  error: 'mt-2 text-sm text-destructive',
                }}
              />

              {error && (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
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
                className="app-primary-link entry-action"
                classNames={{
                  label: 'inline-flex items-center justify-center gap-2',
                }}
              >
                {isSubmitting ? (
                  <>
                    <LoadingSpinner className="h-4 w-4 border-current/25 border-t-current" />
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
