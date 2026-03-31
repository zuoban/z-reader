'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';

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
      <div className="min-h-screen flex items-center justify-center warm-gradient paper-texture">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-foreground/20 rounded-full animate-spin"
               style={{ borderTopColor: 'var(--foreground)' }} />
          <p className="text-sm text-muted-foreground font-medium">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center warm-gradient paper-texture p-4">
      <Card className="w-full max-w-sm border-border/50 shadow-lg">
        <CardHeader className="space-y-3 pb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-10 ink-gradient rounded flex items-center justify-center">
              <span className="text-primary-foreground font-semibold text-sm">Z</span>
            </div>
            <CardTitle className="text-2xl font-semibold tracking-tight">Z Reader</CardTitle>
          </div>
          <CardDescription className="text-sm text-muted-foreground">
            输入密码访问您的书库
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">密码</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入密码"
                autoFocus
                className="h-10"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded border border-destructive/20">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="w-full h-10 ink-gradient text-primary-foreground font-medium"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 rounded-full animate-spin"
                       style={{ borderTopColor: 'var(--primary-foreground)' }} />
                  验证中
                </span>
              ) : (
                '进入'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}