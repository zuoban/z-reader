'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, CircleAlert, Eye, EyeOff, MoveRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { BrandMark, LoadingSpinner, LoadingState } from '@/components/AppShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

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
      <div className="relative min-h-screen bg-white dark:bg-[#0a0a0a]">
        <LoadingState title="加载中..." />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-white dark:bg-[#0a0a0a] px-6">
      
      <div className="w-full max-w-[400px] flex flex-col items-center">
        
        {/* Header Section */}
        <div className="mb-12 flex flex-col items-center">
          <div className="mb-4 flex items-center gap-3">
            <BookOpen size={42} strokeWidth={1.5} className="text-black dark:text-white" />
            <span className="text-3xl font-bold tracking-tight text-black dark:text-white">ZReader</span>
          </div>
          <p className="text-[17px] font-medium text-gray-500 dark:text-gray-400">
            登录到您的书库
          </p>
        </div>

        {/* Form Section */}
        <form onSubmit={handleSubmit} className="w-full space-y-6">
          {/* Username */}
          <div className="space-y-2">
            <Label
              htmlFor="username"
              className="text-sm font-bold text-gray-900 dark:text-gray-100"
            >
              邮箱或用户名
            </Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (usernameError) setUsernameError('');
              }}
              placeholder="请输入您的邮箱"
              autoComplete="username"
              autoFocus
              className="h-12 w-full rounded-lg border-none bg-gray-100 dark:bg-[#1a1a1a] px-4 text-base transition-all placeholder:text-gray-400 focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-800"
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
              className="text-sm font-bold text-gray-900 dark:text-gray-100"
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
                autoComplete="current-password"
                className="h-12 w-full rounded-lg border-none bg-gray-100 dark:bg-[#1a1a1a] px-4 pr-12 text-base transition-all placeholder:text-gray-400 focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-800"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
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
            <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              <CircleAlert size={16} />
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="h-12 w-full rounded-lg bg-[#050509] text-base font-bold text-white transition-all hover:bg-black active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {isSubmitting ? (
              <div className="flex items-center justify-center gap-2">
                <LoadingSpinner className="h-4 w-4 border-white/20 border-t-white dark:border-black/20 dark:border-t-black" />
                正在登录...
              </div>
            ) : (
              '登录'
            )}
          </button>
        </form>

        {/* Footer Section */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            还没有账号？ <span className="font-bold text-gray-900 dark:text-gray-100 cursor-pointer hover:underline">立即创建</span>
          </p>
        </div>

      </div>
    </div>
  );
}
