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
          <div className="w-12 h-12 border-2 border-foreground/20 rounded-full animate-subtle-float" 
               style={{ borderRightColor: 'oklch(0.35 0.08 30)' }} />
          <p className="font-heading text-lg text-muted-foreground">正在打开您的书库...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center warm-gradient paper-texture relative overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-10 w-32 h-32 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute bottom-20 right-10 w-48 h-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-accent/15 blur-3xl" />
      </div>

      <Card className="w-[340px] sm:w-[380px] mx-4 relative backdrop-blur-sm bg-card/95 border-border/50 shadow-xl">
        <CardHeader className="space-y-1 pb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-14 ink-gradient rounded-sm spine-effect flex items-center justify-center">
              <span className="text-primary-foreground font-heading text-xs italic">Z</span>
            </div>
            <CardTitle className="font-heading text-3xl tracking-tight">Z Reader</CardTitle>
          </div>
          <CardDescription className="text-muted-foreground font-sans">
            输入密码以解锁您的个人书库
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password" className="font-heading text-sm">密码</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入您的书库密钥"
                autoFocus
                className="h-10 bg-background/80 border-border/60 focus:border-primary focus:ring-primary/20"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md border border-destructive/20">
                {error}
              </p>
            )}
            <Button 
              type="submit" 
              className="w-full h-10 ink-gradient text-primary-foreground font-heading tracking-wide hover:opacity-90 transition-opacity" 
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 rounded-full animate-subtle-float" 
                        style={{ borderRightColor: 'oklch(0.95 0.01 80)' }} />
                  解锁中...
                </span>
              ) : (
                '进入书库'
              )}
            </Button>
          </form>
          <div className="mt-6 pt-4 border-t border-border/40">
            <p className="text-xs text-muted-foreground text-center font-sans">
              您的私人阅读圣地
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}