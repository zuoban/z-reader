'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, PasswordInput } from '@mantine/core';
import '../styles/mantine-controls.css';
import '@mantine/core/styles/PasswordInput.layer.css';
import { ArrowLeft, ArrowRight, CircleAlert, Eye, EyeOff, KeyRound } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AppScreen, BrandLogo, LoadingSpinner, LoadingState } from '@/components/AppShell';
import { LandingThemeToggle } from '@/components/LandingThemeToggle';
import { LibraryPreview } from '@/components/LibraryPreview';
import '../styles/entry.css';

export default function LoginPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated, login } = useAuth({ redirectOnExpire: false });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [error, setError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  function updateCapsLockState(e: React.KeyboardEvent<HTMLInputElement>) {
    if (typeof e.getModifierState === 'function') {
      setCapsLockOn(e.getModifierState('CapsLock'));
    }
  }

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/shelf');
    }
  }, [isLoading, isAuthenticated, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
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
      requestAnimationFrame(() => {
        passwordRef.current?.focus();
        passwordRef.current?.select();
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isAuthenticated) {
    return (
      <AppScreen>
        <LoadingState title="加载中..." />
      </AppScreen>
    );
  }

  return (
    <AppScreen contentClassName="entry-screen entry-atmosphere flex flex-col">
      <div className="app-container flex flex-1 flex-col items-center lg:justify-center lg:py-8">
        <header className="flex h-14 w-full max-w-5xl items-center justify-between gap-4 border-b border-border/80 sm:h-16 lg:mb-5 lg:h-auto lg:border-0">
          <Link href="/" aria-label="Z Reader 首页" className="entry-nav-link inline-flex">
            <BrandLogo compact />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <LandingThemeToggle />
            <Link href="/" className="entry-nav-link inline-flex">
              <ArrowLeft size={16} strokeWidth={1.5} aria-hidden="true" />
              返回首页
            </Link>
          </div>
        </header>
        <main className="auth-layout mt-8 sm:mt-10 lg:mt-0">
          <aside className="auth-editorial">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-accent/65 px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                <span
                  aria-hidden="true"
                  className="inline-block size-1.5 rounded-full bg-primary"
                />
                <span>私人书库</span>
              </p>
              <h2 className="entry-title mt-4 text-2xl xl:text-[1.75rem]">
                私人书库，随时续读
              </h2>
              <p className="mt-3 max-w-[23em] text-pretty text-sm leading-6 text-muted-foreground">
                书籍、书签和阅读进度都保存在同一处
              </p>
            </div>
            <LibraryPreview />
          </aside>
          <div className="auth-form-panel paper-panel rounded-2xl p-6 sm:p-8 lg:rounded-none lg:border-0 lg:bg-transparent lg:px-12 lg:py-14 lg:shadow-none xl:px-16">
            <div className="mb-7">
              <div
                aria-hidden="true"
                className="app-sheet-icon mb-4 inline-flex size-10 items-center justify-center rounded-xl border border-primary/15"
              >
                <KeyRound size={18} strokeWidth={1.6} />
              </div>
              <h1 className="entry-title text-[1.75rem] lg:text-4xl">
                解锁书库
              </h1>
              <p className="mt-2.5 text-sm leading-6 text-muted-foreground">
                输入访问密码继续阅读
              </p>
            </div>

            <form onSubmit={handleSubmit} className="w-full space-y-5">
              <PasswordInput
                id="password"
                ref={passwordRef}
                label="访问密码"
                inputWrapperOrder={['label', 'input', 'description', 'error']}
                value={password}
                disabled={isSubmitting}
                onChange={(e) => {
                  setPassword(e.currentTarget.value);
                  if (passwordError) setPasswordError('');
                  if (error) setError('');
                }}
                onKeyDown={updateCapsLockState}
                onKeyUp={updateCapsLockState}
                onBlur={() => setCapsLockOn(false)}
                visible={showPassword}
                onVisibilityChange={setShowPassword}
                visibilityToggleFocusable
                placeholder="请输入访问密码"
                autoComplete="current-password"
                aria-invalid={Boolean(passwordError || error)}
                description={
                  capsLockOn ? (
                    <span className="inline-flex items-center gap-1.5">
                      <CircleAlert
                        size={14}
                        className="shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span>大写锁定已开启</span>
                    </span>
                  ) : undefined
                }
                descriptionProps={{
                  id: 'caps-lock-hint',
                  role: 'status',
                  'aria-live': 'polite',
                }}
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
                  'aria-pressed': showPassword,
                  title: showPassword ? '隐藏密码' : '显示密码',
                  disabled: isSubmitting,
                  className: 'entry-password-toggle',
                }}
                classNames={{
                  label: 'mb-2 text-sm font-medium text-foreground',
                  input: 'app-field entry-field',
                  innerInput: 'entry-password-input',
                  section: 'entry-password-section',
                  description: 'mt-2 text-xs text-muted-foreground',
                  error: 'mt-2 text-sm text-destructive',
                }}
              />

              {error && (
                <div
                  id="login-error"
                  role="alert"
                  className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                >
                  <CircleAlert size={16} className="shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                variant="filled"
                fullWidth
                disabled={isSubmitting}
                aria-busy={isSubmitting || undefined}
                className="app-primary-link entry-action cursor-pointer"
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
                  <>
                    进入书架
                    <ArrowRight size={16} strokeWidth={1.6} aria-hidden="true" />
                  </>
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
