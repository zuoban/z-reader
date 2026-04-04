'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Layers3,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { Category } from '@/lib/api';

const CATEGORY_COLOR_PRESETS = [
  { name: '晴蓝', value: '#A4D3F2' },
  { name: '海青', value: '#2DABC2' },
  { name: '深海', value: '#143B5D' },
  { name: '金黄', value: '#FDBA11' },
  { name: '橙焰', value: '#FF8A00' },
  { name: '珊红', value: '#E85D3F' },
  { name: '松绿', value: '#5D9B6A' },
  { name: '葡紫', value: '#7A64B8' },
] as const;

// 暗色系颜色，需要白色图标
const DARK_COLORS = ['#143B5D', '#2DABC2', '#5D9B6A', '#7A64B8'] as const;

function getContrastColor(color: string): string {
  return DARK_COLORS.includes(color as (typeof DARK_COLORS)[number]) ? '#fff' : '#143B5D';
}

interface CategoryManagerProps {
  onCategoryChange?: () => void;
}

export function CategoryManager({ onCategoryChange }: CategoryManagerProps) {
  const [open, setOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(CATEGORY_COLOR_PRESETS[0].value);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      void loadCategories();
    } else {
      resetForm();
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
    }
  }, [open]);

  async function loadCategories() {
    try {
      const data = await api.listCategories();
      setCategories(data || []);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  }

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    if (trimmedName.length > 50) {
      toast.error('分类名称不能超过 50 个字符');
      return;
    }
    setLoading(true);
    try {
      if (editingId) {
        await api.updateCategory(editingId, { name: trimmedName, color });
      } else {
        await api.createCategory({ name: trimmedName, color });
      }
      await loadCategories();
      onCategoryChange?.();
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string): Promise<boolean> {
    setLoading(true);
    try {
      await api.deleteCategory(id);
      await loadCategories();
      onCategoryChange?.();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleMove(category: Category, direction: 'up' | 'down') {
    const index = categories.findIndex((item) => item.id === category.id);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const swapTarget = categories[targetIndex];

    if (index === -1 || !swapTarget) return;

    setLoading(true);
    try {
      await Promise.all([
        api.updateCategory(category.id, { sort_order: swapTarget.sort_order }),
        api.updateCategory(swapTarget.id, { sort_order: category.sort_order }),
      ]);
      await loadCategories();
      onCategoryChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '排序失败');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(category: Category) {
    setEditingId(category.id);
    setName(category.name);
    setColor(category.color);
  }

  function resetForm() {
    setEditingId(null);
    setName('');
    setColor(CATEGORY_COLOR_PRESETS[0].value);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            size="icon-sm"
            title="管理分类"
            aria-label="管理分类"
            className="h-11 w-11 shrink-0 rounded-full border-border/70 bg-background p-0 shadow-none hover:bg-muted sm:h-11 sm:w-11 cursor-pointer"
          />
        }
      >
        <Layers3 className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
      </SheetTrigger>
      <SheetContent
        side="right"
        showCloseButton
        finalFocus={false}
        className="w-[100vw] max-w-[100vw] overflow-hidden rounded-none border-l border-border/60 bg-gradient-to-br from-background via-background to-muted/30 p-0 shadow-2xl dark:from-background dark:via-background dark:to-muted/20 sm:w-[480px] sm:max-w-[480px] sm:rounded-l-[28px]"
      >
        {/* 头部区域 */}
        <SheetHeader className="border-b border-border/50 bg-muted/30 px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 shadow-sm">
              <Layers3 className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 space-y-1">
              <SheetTitle className="text-xl font-semibold tracking-tight">
                管理分类
              </SheetTitle>
              <p className="text-sm text-muted-foreground">
                创建、编辑和删除分类，整理你的书架内容
              </p>
            </div>
          </div>
        </SheetHeader>

        {/* 主要内容区域 */}
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-6 p-6">
            {/* 新建/编辑表单 */}
            <section className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm transition-all duration-300">
              <div className="mb-5 flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold">
                    {editingId ? '编辑分类' : '新建分类'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    输入名称并选择颜色
                  </p>
                </div>
                {editingId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetForm}
                    className="gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                    取消
                  </Button>
                )}
              </div>

              <div className="space-y-5">
                {/* 名称输入 */}
                <div className="space-y-2">
                  <label htmlFor="category-name" className="text-sm font-medium">
                    分类名称
                  </label>
                  <Input
                    id="category-name"
                    placeholder="输入分类名称"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    maxLength={50}
                    className="h-12 rounded-2xl bg-background/80 px-4 text-base transition-all focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="text-xs text-muted-foreground">
                    {name.length}/50 字符
                  </p>
                </div>

                {/* 颜色选择 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">选择颜色</label>
                    <div
                      className="flex items-center gap-2 rounded-full border border-border/60 px-3 py-1.5"
                      style={{ backgroundColor: color + '20' }}
                    >
                      <div
                        className="h-3.5 w-3.5 rounded-full border border-white/40 shadow-sm"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs font-medium" style={{ color }}>
                        {CATEGORY_COLOR_PRESETS.find((p) => p.value === color)?.name || color}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {CATEGORY_COLOR_PRESETS.map((preset) => {
                      const selected = color === preset.value;
                      return (
                        <button
                          key={preset.value}
                          type="button"
                          onClick={() => setColor(preset.value)}
                          disabled={loading}
                          aria-pressed={selected}
                          aria-label={`选择颜色 ${preset.name}`}
                          title={preset.name}
                          className="group relative flex h-14 items-center justify-center rounded-2xl border-2 border-transparent transition-all duration-200 hover:scale-105 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          style={{ backgroundColor: preset.value }}
                        >
                          <span
                            className={`absolute inset-0 rounded-2xl border-2 transition-all duration-200 ${
                              selected
                                ? 'border-foreground scale-105 shadow-lg'
                                : 'border-transparent'
                            }`}
                          >
                            {selected && (
                              <span className="absolute inset-0 flex items-center justify-center">
                                <Check className="h-5 w-5 drop-shadow-md" style={{ color: getContrastColor(preset.value) }} />
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 提交按钮 */}
                <Button
                  onClick={handleSave}
                  disabled={loading || !name.trim()}
                  className="h-12 w-full rounded-2xl text-base font-medium shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98] disabled:opacity-60 disabled:shadow-none cursor-pointer"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      {editingId ? '保存中...' : '创建中...'}
                    </span>
                  ) : editingId ? (
                    <>
                      <Pencil className="mr-2 h-5 w-5" />
                      保存修改
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-5 w-5" />
                      创建分类
                    </>
                  )}
                </Button>
              </div>
            </section>

            {/* 已有分类列表 */}
            <section className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold">已有分类</h3>
                  <p className="text-sm text-muted-foreground">
                    点击操作按钮进行编辑或删除
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-border/60 bg-muted/50 px-3 py-1.5 text-sm font-medium text-muted-foreground">
                  <Layers3 className="h-4 w-4" />
                  {categories.length}
                </div>
              </div>

              <ScrollArea className="max-h-[min(50vh,28rem)] pr-2">
                <div className="space-y-3">
                  {categories.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border/60 bg-muted/20 py-12 text-center transition-all">
                      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-background shadow-sm">
                        <Layers3 className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <p className="mb-1 text-base font-medium">暂无分类</p>
                      <p className="max-w-[240px] text-sm text-muted-foreground">
                        创建一个分类来整理你的书籍
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {categories.map((cat, index) => {
                        const isEditing = editingId === cat.id;
                        return (
                          <div
                            key={cat.id}
                            className={`group relative flex items-center gap-4 rounded-2xl border-2 p-3 pr-4 transition-all duration-200 cursor-pointer ${
                              isEditing
                                ? 'border-primary/40 bg-primary/5 shadow-md'
                                : 'border-border/50 bg-background hover:border-border hover:shadow-md hover:bg-muted/30'
                            }`}
                          >
                            {/* 颜色标记 */}
                            <div
                              className="h-12 w-12 shrink-0 rounded-2xl border-2 border-white/30 shadow-sm transition-transform group-hover:scale-105"
                              style={{ backgroundColor: cat.color }}
                            />

                            {/* 分类信息 */}
                            <div className="flex-1 min-w-0">
                              <div className="truncate text-base font-medium">{cat.name}</div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {isEditing ? (
                                  <span className="flex items-center gap-1 text-primary">
                                    <Pencil className="h-3 w-3" />
                                    正在编辑
                                  </span>
                                ) : (
                                  <>
                                    <span>创建于</span>
                                    <span className="font-medium">{cat.sort_order}</span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* 排序按钮 */}
                            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMove(cat, 'up');
                                }}
                                disabled={loading || index === 0}
                                className="h-9 w-9 rounded-xl hover:bg-muted"
                                title="上移"
                              >
                                <ArrowUp className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMove(cat, 'down');
                                }}
                                disabled={loading || index === categories.length - 1}
                                className="h-9 w-9 rounded-xl hover:bg-muted"
                                title="下移"
                              >
                                <ArrowDown className="h-4 w-4" />
                              </Button>
                            </div>

                            {/* 操作菜单 */}
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                className="h-9 w-9 rounded-xl opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted cursor-pointer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40 rounded-2xl p-1.5">
                                <DropdownMenuItem
                                  onClick={() => startEdit(cat)}
                                  disabled={loading}
                                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 cursor-pointer"
                                >
                                  <Pencil className="h-4 w-4" />
                                  <span>编辑</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="my-1.5" />
                                <DropdownMenuItem
                                  onClick={() => {
                                    setDeleteTarget(cat);
                                    setDeleteConfirmOpen(true);
                                  }}
                                  disabled={loading}
                                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-destructive focus:bg-destructive/10 cursor-pointer"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span>删除</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </section>
          </div>
        </div>
      </SheetContent>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(nextOpen) => {
          setDeleteConfirmOpen(nextOpen);
          if (!nextOpen) {
            setDeleteTarget(null);
          }
        }}
        title="删除分类"
        description={
          deleteTarget
            ? `确定删除“${deleteTarget.name}”吗？相关图书的分类将被清空。`
            : '确定删除此分类吗？相关图书的分类将被清空。'
        }
        confirmLabel={loading ? '删除中' : '确认删除'}
        confirmDisabled={loading || !deleteTarget}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const success = await handleDelete(deleteTarget.id);
          if (success) {
            setDeleteConfirmOpen(false);
            setDeleteTarget(null);
          }
        }}
      />
    </Sheet>
  );
}
