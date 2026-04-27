'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, ShieldCheck, Trash2, UserCog, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import type { User } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { cn } from '@/lib/utils';

interface UserManagerProps {
  currentUser?: User | null;
  buttonClassName?: string;
  triggerLabel?: string;
}

export function UserManager({ currentUser, buttonClassName, triggerLabel }: UserManagerProps) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<User['role']>('user');
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);

  async function loadUsers() {
    try {
      const data = await api.listUsers();
      setUsers(data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载用户失败');
    }
  }

  function resetForm() {
    setUsername('');
    setPassword('');
    setRole('user');
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (nextOpen) {
      void loadUsers();
      return;
    }

    resetForm();
    setDeleteTarget(null);
    setDeleteConfirmOpen(false);
    closeResetPasswordDialog();
  }

  async function handleCreate() {
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();
    if (!trimmedUsername || !trimmedPassword) return;

    setLoading(true);
    try {
      await api.createUser({
        username: trimmedUsername,
        password: trimmedPassword,
        role,
      });
      await loadUsers();
      resetForm();
      toast.success('用户已创建');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建用户失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleRoleChange(user: User, nextRole: User['role']) {
    if (user.role === nextRole) return;
    setLoading(true);
    try {
      await api.updateUser(user.id, { role: nextRole });
      await loadUsers();
      toast.success('角色已更新');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新角色失败');
    } finally {
      setLoading(false);
    }
  }

  function openResetPasswordDialog(user: User) {
    setResetTarget(user);
    setResetPassword('');
    setResetPasswordOpen(true);
  }

  function closeResetPasswordDialog() {
    setResetPasswordOpen(false);
    setResetTarget(null);
    setResetPassword('');
  }

  async function handleResetPassword() {
    if (!resetTarget) return;
    if (resetPassword.trim().length < 6) {
      toast.error('密码至少需要 6 个字符');
      return;
    }

    setLoading(true);
    try {
      await api.updateUser(resetTarget.id, { password: resetPassword.trim() });
      toast.success('密码已更新');
      closeResetPasswordDialog();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新密码失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setLoading(true);
    try {
      await api.deleteUser(deleteTarget.id);
      await loadUsers();
      toast.success('用户已删除');
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除用户失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label="用户管理"
            className={cn(buttonClassName, 'cursor-pointer')}
          />
        }
      >
        <UserCog className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
        {triggerLabel && <span className="hidden sm:inline">{triggerLabel}</span>}
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex flex-col border-l-0 p-0 sm:w-[380px] sm:max-w-[380px] sm:[&_[data-slot=sheet-close]]:right-4 sm:[&_[data-slot=sheet-close]]:top-4 sm:[&_[data-slot=sheet-close]]:h-9 sm:[&_[data-slot=sheet-close]]:w-9 sm:[&_[data-slot=sheet-close]]:rounded-full sm:[&_[data-slot=sheet-close]]:border-0 sm:[&_[data-slot=sheet-close]]:bg-muted/40 sm:[&_[data-slot=sheet-close]]:shadow-none"
        style={{
          backgroundColor: 'var(--shelf-surface)',
          boxShadow: '20px 0 60px -20px var(--paper-shadow)',
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <SheetHeader
            className="relative overflow-hidden border-b border-border/40 bg-[var(--shelf-surface-raised)] px-6 py-8 pr-20"
          >
            <div className="absolute -left-8 -top-8 h-32 w-32 rounded-full bg-primary/10" />
            <div className="absolute -bottom-8 -right-8 h-24 w-24 rounded-full bg-accent/10" />

            <div className="relative flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm shadow-primary/5">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-xl font-bold tracking-tight text-foreground">
                  用户管理
                </SheetTitle>
                <SheetDescription className="mt-1 text-[11px] font-medium text-muted-foreground/70">
                  集中维护账号权限与安全设置
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex-1 space-y-6 px-6 pb-12 pt-6">
              <section className="space-y-4 rounded-[1.75rem] border border-border/40 bg-card p-5 shadow-sm transition-all hover:bg-card">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold tracking-tight text-foreground">账号概览</h3>
                  <p className="text-[11px] font-medium leading-relaxed text-muted-foreground/70">
                    当前可访问系统的账号与权限分布。
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="flex items-center justify-center gap-1.5 rounded-[1.25rem] border border-border/20 bg-muted/35 px-3 py-2.5 text-xs font-bold text-foreground">
                  <UserCog className="h-3 w-3" />
                  {users.length} 位用户
                  </div>
                  <div className="flex items-center justify-center rounded-[1.25rem] border border-border/20 bg-muted/35 px-3 py-2.5 text-xs font-bold text-muted-foreground">
                  {users.filter((user) => user.role === 'admin').length} 名管理员
                  </div>
                </div>
              </section>

              {/* Create User Section */}
              <section className="space-y-4 rounded-[1.75rem] border border-border/40 bg-card p-5 shadow-sm transition-all hover:bg-card">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2.5">
                    <UserPlus className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-bold tracking-tight text-foreground">新建用户</h3>
                  </div>
                  <p className="text-[11px] font-medium leading-relaxed text-muted-foreground/70">
                    为新的阅读成员分配初始密码与权限角色。
                  </p>
                </div>
                
                <div className="grid gap-5 pt-1">
                    <div className="space-y-2">
                      <Label htmlFor="new-username" className="pl-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">
                        用户名
                      </Label>
                      <Input
                        id="new-username"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        placeholder="请输入用户名"
                        disabled={loading}
                        className="h-11 rounded-[1.25rem] border-border/60 bg-background transition-all focus:bg-background focus:ring-4 focus:ring-primary/5"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-password" className="pl-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">
                        初始密码
                      </Label>
                      <Input
                        id="new-password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="至少 6 位"
                        disabled={loading}
                        className="h-11 rounded-[1.25rem] border-border/60 bg-background transition-all focus:bg-background focus:ring-4 focus:ring-primary/5"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="pl-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">权限角色</Label>
                      <Select
                        value={role}
                        onValueChange={(value) => setRole(value as User['role'])}
                        disabled={loading}
                      >
                        <SelectTrigger className="h-11 rounded-[1.25rem] border-border/60 bg-background transition-all hover:bg-muted/40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-border/60 shadow-xl">
                          <SelectItem value="user">普通用户</SelectItem>
                          <SelectItem value="admin">管理员</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                  <Button
                    onClick={handleCreate}
                    disabled={loading || !username.trim() || password.trim().length < 6}
                    className="h-11 w-full rounded-[1.25rem] font-bold shadow-lg shadow-primary/10 transition-all active:scale-[0.98]"
                  >
                    确认创建
                  </Button>
                </div>
              </section>

              {/* User List Section */}
              <section className="space-y-4 rounded-[1.75rem] border border-border/40 bg-card p-5 shadow-sm transition-all hover:bg-card">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2.5">
                      <UserCog className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-bold tracking-tight text-foreground">成员列表</h3>
                    </div>
                    <p className="text-[11px] font-medium leading-relaxed text-muted-foreground/70">
                      调整角色，或为账号重置密码。
                    </p>
                  </div>
                </div>

                <div className="grid gap-3">
                  {users.map((user) => {
                    const isCurrentUser = currentUser?.id === user.id;
                    return (
                      <div
                        key={user.id}
                        className="group flex flex-col gap-4 rounded-[1.5rem] border border-border/20 bg-muted/20 p-4 transition-all hover:border-border/40 hover:bg-muted/30"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="text-base font-bold tracking-tight">
                              {user.username}
                            </span>
                            <div className="flex gap-1.5">
                              {isCurrentUser && (
                                <span className="rounded-md border border-border/60 bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                                  当前
                                </span>
                              )}
                              <span className={cn(
                                "rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                                user.role === 'admin' 
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" 
                                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                              )}>
                                {user.role === 'admin' ? '管理员' : '普通用户'}
                              </span>
                            </div>
                          </div>
                          <p className="mt-1 text-[12px] font-medium text-muted-foreground/60">
                            {user.role === 'admin' ? '拥有完整系统管理权限' : '标准阅读访问权限'}
                          </p>
                        </div>
                        
                        <div className="flex shrink-0 items-center justify-between gap-3">
                          <Select
                            value={user.role}
                            onValueChange={(value) => handleRoleChange(user, value as User['role'])}
                            disabled={loading}
                          >
                            <SelectTrigger className="h-9 w-[106px] rounded-xl border-border/60 bg-muted/35 text-[12px] font-semibold transition-all hover:bg-muted/55">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-border/60">
                              <SelectItem value="user">普通用户</SelectItem>
                              <SelectItem value="admin">管理员</SelectItem>
                            </SelectContent>
                          </Select>
                          
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="重置密码"
                              onClick={() => openResetPasswordDialog(user)}
                              disabled={loading}
                              className="h-9 w-9 rounded-xl text-muted-foreground/55 transition-all hover:bg-muted hover:text-foreground"
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="删除用户"
                              onClick={() => {
                                setDeleteTarget(user);
                                setDeleteConfirmOpen(true);
                              }}
                              disabled={loading || isCurrentUser}
                              className="h-9 w-9 rounded-xl text-muted-foreground/45 transition-all hover:bg-destructive/10 hover:text-destructive disabled:text-muted-foreground/25"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        </div>
      </SheetContent>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="删除用户"
        description={
          deleteTarget
            ? `确定删除用户「${deleteTarget.username}」吗？`
            : '确定删除这个用户吗？'
        }
        confirmLabel="删除"
        cancelLabel="取消"
        confirmVariant="destructive"
        onConfirm={handleDelete}
      />
      <Dialog
        open={resetPasswordOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setResetPasswordOpen(true);
          } else {
            closeResetPasswordDialog();
          }
        }}
      >
        <DialogContent
          className="max-w-[400px] gap-0 overflow-hidden rounded-[1.75rem] border-border/50 p-0 shadow-2xl [&_[data-slot=dialog-close]]:right-4 [&_[data-slot=dialog-close]]:top-4 [&_[data-slot=dialog-close]]:rounded-full [&_[data-slot=dialog-close]]:bg-muted/45 [&_[data-slot=dialog-close]]:shadow-none"
          showCloseButton={!loading}
        >
          <div className="relative overflow-hidden border-b border-border/45 bg-[var(--shelf-surface-raised)] px-6 py-7 pr-16">
            <div className="absolute -left-8 -top-8 h-28 w-28 rounded-full bg-primary/10" />
            <div className="absolute -bottom-10 -right-10 h-24 w-24 rounded-full bg-accent/10" />
            <DialogHeader className="relative space-y-2">
              <DialogTitle className="text-xl font-bold tracking-tight">重置密码</DialogTitle>
              <DialogDescription className="text-[13px] leading-6 text-muted-foreground/80">
                {resetTarget
                  ? `为您选定的用户「${resetTarget.username}」设置一个更安全的新密码。`
                  : '设置一个安全的新密码。'}
              </DialogDescription>
            </DialogHeader>
          </div>
          
          <form
            className="space-y-6 bg-card p-6"
            onSubmit={(event) => {
              event.preventDefault();
              void handleResetPassword();
            }}
          >
            <div className="space-y-2.5">
              <Label htmlFor="reset-password" className="pl-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">
                新密码
              </Label>
              <Input
                id="reset-password"
                type="password"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
                placeholder="至少 6 个字符"
                autoComplete="new-password"
                disabled={loading}
                autoFocus
                className="h-11 rounded-[1.25rem] border-border/60 bg-background transition-all focus:bg-background focus:ring-4 focus:ring-primary/5"
              />
            </div>
            
            <DialogFooter className="-mx-6 -mb-6 flex-row items-center justify-end gap-2 border-t border-border/45 bg-background px-6 py-4">
              <Button
                type="submit"
                className="h-9 rounded-xl px-5 text-[13px] font-semibold shadow-[0_8px_18px_-14px_var(--paper-shadow)] transition-all active:scale-[0.98]"
                disabled={loading || resetPassword.trim().length < 6}
              >
                保存设置
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
