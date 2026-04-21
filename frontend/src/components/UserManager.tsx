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
          <SheetHeader className="border-0 bg-transparent px-4 pb-3 pt-4 text-left sm:px-5">
            <div className="rounded-[1.25rem] border border-border/60 bg-gradient-to-b from-background to-muted/35 px-4 py-4 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/8 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <SheetTitle className="text-lg font-semibold">
                    用户管理
                  </SheetTitle>
                  <SheetDescription className="mt-1 text-[13px] leading-5">
                    在这里创建账号、调整权限并处理密码重置，适合集中维护多人阅读环境。
                  </SheetDescription>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  <UserCog className="h-3.5 w-3.5" />
                  {users.length} 位用户
                </span>
                <span className="inline-flex items-center rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  {users.filter((user) => user.role === 'admin').length} 位管理员
                </span>
                <span className="inline-flex items-center rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  支持即时修改角色
                </span>
              </div>
            </div>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-6 px-4 pb-5 sm:px-5">
              <section className="rounded-[1.25rem] border border-border/60 bg-gradient-to-b from-background to-muted/25 p-4 shadow-[0_16px_36px_rgba(15,23,42,0.05)]">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <UserPlus className="h-4 w-4" />
                  新建用户
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_120px]">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-username" className="text-xs text-muted-foreground">
                      用户名
                    </Label>
                    <Input
                      id="new-username"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="reader"
                      disabled={loading}
                      className="h-11 rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="new-password" className="text-xs text-muted-foreground">
                      密码
                    </Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="至少 6 位"
                      disabled={loading}
                      className="h-11 rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">角色</Label>
                    <Select
                      value={role}
                      onValueChange={(value) => setRole(value as User['role'])}
                      disabled={loading}
                    >
                      <SelectTrigger className="h-11 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">用户</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  onClick={handleCreate}
                  disabled={loading || !username.trim() || password.trim().length < 6}
                  className="mt-4 h-11 rounded-xl shadow-sm"
                >
                  创建用户
                </Button>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">已有用户</div>
                  <div className="rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                    共 {users.length} 人
                  </div>
                </div>
                <div className="space-y-2.5">
                  {users.map((user) => {
                    const isCurrentUser = currentUser?.id === user.id;
                    return (
                      <div
                        key={user.id}
                        className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/90 px-3.5 py-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-semibold">
                              {user.username}
                            </span>
                            {isCurrentUser && (
                              <span className="rounded-full border border-border/60 bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                                当前账号
                              </span>
                            )}
                            <span className="rounded-full border border-border/60 bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                              {user.role === 'admin' ? 'Admin' : '用户'}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {user.role === 'admin' ? '拥有系统管理权限' : '可进行日常阅读与管理操作'}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Select
                            value={user.role}
                            onValueChange={(value) => handleRoleChange(user, value as User['role'])}
                            disabled={loading}
                          >
                            <SelectTrigger className="h-9 w-[108px] rounded-xl">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">用户</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="重置密码"
                            onClick={() => openResetPasswordDialog(user)}
                            disabled={loading}
                            className="h-9 w-9 rounded-xl border border-transparent bg-background/70 p-0"
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="删除用户"
                            onClick={() => {
                              setDeleteTarget(user);
                              setDeleteConfirmOpen(true);
                            }}
                            disabled={loading || isCurrentUser}
                            className="h-9 w-9 rounded-xl border border-transparent bg-background/70 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
        <DialogContent className="max-w-sm" showCloseButton={!loading}>
          <DialogHeader>
            <DialogTitle>重置密码</DialogTitle>
            <DialogDescription>
              {resetTarget
                ? `为「${resetTarget.username}」设置一个新密码。`
                : '设置一个新密码。'}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleResetPassword();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="reset-password" className="text-xs text-muted-foreground">
                新密码
              </Label>
              <Input
                id="reset-password"
                type="password"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
                placeholder="至少 6 位"
                autoComplete="new-password"
                disabled={loading}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeResetPasswordDialog}
                disabled={loading}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={loading || resetPassword.trim().length < 6}
              >
                保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
