'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (open) {
      void loadUsers();
    } else {
      resetForm();
      setDeleteTarget(null);
      setDeleteConfirmOpen(false);
      closeResetPasswordDialog();
    }
  }, [open]);

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
    <Sheet open={open} onOpenChange={setOpen}>
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
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-[520px]">
        <div className="flex min-h-full flex-col">
          <SheetHeader className="border-b border-border/60 px-5 py-5 text-left">
            <SheetTitle className="flex items-center gap-2 text-lg font-semibold">
              <ShieldCheck className="h-5 w-5" />
              用户管理
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-6 px-5 py-5">
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <UserPlus className="h-4 w-4" />
                新建用户
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_120px]">
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
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">角色</Label>
                  <Select
                    value={role}
                    onValueChange={(value) => setRole(value as User['role'])}
                    disabled={loading}
                  >
                    <SelectTrigger>
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
                className="h-10 rounded-md"
              >
                创建用户
              </Button>
            </section>

            <section className="space-y-3">
              <div className="text-sm font-semibold">已有用户</div>
              <div className="space-y-2">
                {users.map((user) => {
                  const isCurrentUser = currentUser?.id === user.id;
                  return (
                    <div
                      key={user.id}
                      className="flex flex-col gap-3 rounded-md border border-border/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold">
                            {user.username}
                          </span>
                          {isCurrentUser && (
                            <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                              当前账号
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {user.role === 'admin' ? 'Admin' : '用户'}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Select
                          value={user.role}
                          onValueChange={(value) => handleRoleChange(user, value as User['role'])}
                          disabled={loading}
                        >
                          <SelectTrigger className="h-8 w-[104px]">
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
                          className="h-8 w-8 rounded-md p-0"
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
                          className="h-8 w-8 rounded-md p-0 text-destructive hover:text-destructive"
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
