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
}

export function UserManager({ currentUser, buttonClassName }: UserManagerProps) {
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
            title="用户管理"
            aria-label="用户管理"
            className={cn(buttonClassName, 'cursor-pointer')}
          />
        }
      >
        <UserCog className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
      </SheetTrigger>
      <SheetContent side="right" className="w-full p-0 sm:max-w-[520px]">
        <div className="flex min-h-0 flex-1 flex-col">
          <SheetHeader className="border-b border-border/40 bg-background/50 px-6 pb-6 pt-8 backdrop-blur-md">
            <div className="flex items-center gap-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm shadow-primary/5">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-2xl font-bold tracking-tight text-foreground">
                  用户管理
                </SheetTitle>
                <SheetDescription className="mt-1 text-[13px] font-medium text-muted-foreground/80">
                  集中维护账号权限与安全设置
                </SheetDescription>
              </div>
            </div>
            
            <div className="mt-6 flex flex-wrap gap-2">
              <div className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-[10px] font-bold tracking-wider text-primary">
                <UserCog className="h-3 w-3" />
                {users.length} 位用户
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-3 py-1.5 text-[10px] font-bold tracking-wider text-muted-foreground">
                {users.filter((user) => user.role === 'admin').length} 名管理员
              </div>
            </div>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-12 bg-muted/20 px-6 pb-12 pt-8">
              {/* Create User Section */}
              <section className="space-y-4">
                <div className="flex items-center gap-2.5 px-1">
                  <UserPlus className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground/90">新建用户</h3>
                </div>
                
                <div className="rounded-[2rem] border border-border/40 bg-background p-6 shadow-sm shadow-primary/5">
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_140px]">
                    <div className="space-y-2">
                      <Label htmlFor="new-username" className="pl-1 text-[11px] font-bold tracking-wide text-muted-foreground/60">
                        用户名
                      </Label>
                      <Input
                        id="new-username"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        placeholder="请输入用户名"
                        disabled={loading}
                        className="h-11 rounded-xl border-border/60 bg-muted/20 transition-all focus:bg-background focus:ring-4 focus:ring-primary/5"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-password" className="pl-1 text-[11px] font-bold tracking-wide text-muted-foreground/60">
                        初始密码
                      </Label>
                      <Input
                        id="new-password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="至少 6 位"
                        disabled={loading}
                        className="h-11 rounded-xl border-border/60 bg-muted/20 transition-all focus:bg-background focus:ring-4 focus:ring-primary/5"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="pl-1 text-[11px] font-bold tracking-wide text-muted-foreground/60">权限角色</Label>
                      <Select
                        value={role}
                        onValueChange={(value) => setRole(value as User['role'])}
                        disabled={loading}
                      >
                        <SelectTrigger className="h-11 rounded-xl border-border/60 bg-muted/20 transition-all hover:bg-muted/40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-border/60 shadow-xl">
                          <SelectItem value="user">普通用户</SelectItem>
                          <SelectItem value="admin">管理员</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button
                    onClick={handleCreate}
                    disabled={loading || !username.trim() || password.trim().length < 6}
                    className="mt-6 h-11 w-full rounded-xl bg-primary font-bold shadow-lg shadow-primary/10 transition-all active:scale-[0.98] sm:w-auto sm:px-10"
                  >
                    确认创建
                  </Button>
                </div>
              </section>

              {/* User List Section */}
              <section className="space-y-4">
                <div className="flex items-center justify-between gap-3 px-1">
                  <div className="flex items-center gap-2.5">
                    <UserCog className="h-4 w-4 text-muted-foreground/80" />
                    <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground/90">成员列表</h3>
                  </div>
                </div>

                <div className="grid gap-3">
                  {users.map((user) => {
                    const isCurrentUser = currentUser?.id === user.id;
                    return (
                      <div
                        key={user.id}
                        className="group flex flex-col gap-4 rounded-2xl border border-border/40 bg-background p-4 transition-all hover:border-primary/20 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="text-base font-bold tracking-tight">
                              {user.username}
                            </span>
                            <div className="flex gap-1.5">
                              {isCurrentUser && (
                                <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[9px] font-black tracking-tighter text-primary">
                                  当前
                                </span>
                              )}
                              <span className={cn(
                                "rounded-md px-1.5 py-0.5 text-[9px] font-black tracking-tighter",
                                user.role === 'admin' 
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" 
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
                        
                        <div className="flex shrink-0 items-center gap-3">
                          <Select
                            value={user.role}
                            onValueChange={(value) => handleRoleChange(user, value as User['role'])}
                            disabled={loading}
                          >
                            <SelectTrigger className="h-9 w-[100px] rounded-lg border-border/60 bg-muted/10 text-[12px] font-bold transition-all hover:bg-muted/20">
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
                              className="h-9 w-9 rounded-lg text-muted-foreground/40 transition-all hover:bg-primary/10 hover:text-primary"
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
                              className="h-9 w-9 rounded-lg text-muted-foreground/40 transition-all hover:bg-destructive/10 hover:text-destructive"
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
        <DialogContent className="max-w-[400px] gap-0 overflow-hidden rounded-[1.5rem] border-border/60 p-0 shadow-2xl" showCloseButton={!loading}>
          <div className="relative border-b border-border/40 bg-muted/20 px-6 py-6">
            <div className="absolute -right-8 -top-8 h-32 w-32 bg-primary/5 blur-[40px]" />
            <DialogHeader className="relative space-y-1.5">
              <DialogTitle className="text-lg font-bold tracking-tight">重置密码</DialogTitle>
              <DialogDescription className="text-[13px] leading-relaxed">
                {resetTarget
                  ? `为您选定的用户「${resetTarget.username}」设置一个更安全的新密码。`
                  : '设置一个安全的新密码。'}
              </DialogDescription>
            </DialogHeader>
          </div>
          
          <form
            className="space-y-6 p-6"
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
                className="h-11 rounded-xl border-border/40 bg-background/40 transition-all focus:bg-background/80"
              />
            </div>
            
            <DialogFooter className="flex-row items-center justify-end gap-2.5 pt-2">
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-xl px-5 text-[13px] font-semibold text-muted-foreground transition-all hover:bg-muted"
                onClick={closeResetPasswordDialog}
                disabled={loading}
              >
                取消
              </Button>
              <Button
                type="submit"
                className="h-10 rounded-xl px-8 text-[13px] font-bold shadow-md transition-all active:scale-[0.98]"
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
