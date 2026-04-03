'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Layers3, Pencil, Palette, Plus, Trash2, X } from 'lucide-react';
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
      alert('分类名称不能超过 50 个字符');
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
      alert(err instanceof Error ? err.message : '操作失败');
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
      alert(err instanceof Error ? err.message : '删除失败');
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
      alert(err instanceof Error ? err.message : '排序失败');
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
            className="h-9 w-9 shrink-0 rounded-full border-border/70 bg-background p-0 shadow-none hover:bg-muted sm:h-10 sm:w-10"
          />
        }
      >
        <Layers3 className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
      </SheetTrigger>
      <SheetContent
        side="right"
        showCloseButton
        finalFocus={false}
        className="w-[100vw] max-w-[100vw] overflow-hidden rounded-none border-l border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.98))] p-0 shadow-2xl backdrop-blur-xl dark:bg-[linear-gradient(180deg,rgba(17,24,39,0.98),rgba(15,23,42,0.98))] sm:w-[460px] sm:max-w-[460px] sm:rounded-l-[28px]"
      >
        <div className="flex h-full min-h-0 flex-col">
          <SheetHeader className="border-b border-border/60 bg-gradient-to-r from-muted/70 via-background to-muted/50 px-5 py-5 pr-14 sm:px-6">
            <div className="flex items-start gap-3">
              <div className="space-y-1.5">
                <SheetTitle className="text-lg font-semibold tracking-tight sm:text-xl">
                  管理分类
                </SheetTitle>
                <p className="max-w-[32rem] text-sm leading-6 text-muted-foreground">
                  创建、编辑和删除分类，帮助你更清晰地整理书架内容。
                </p>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            <div className="grid gap-5 p-5 sm:p-6">
              <section className="rounded-2xl border border-border/70 bg-background/90 p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">
                      {editingId ? '编辑分类' : '新建分类'}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      输入名称并挑选一个颜色，让分类更容易辨认。
                    </p>
                  </div>
                  {editingId && (
                    <Button variant="ghost" size="sm" onClick={resetForm} className="gap-1.5">
                      <X className="h-4 w-4" />
                      退出编辑
                    </Button>
                  )}
                </div>

                <div className="space-y-4">
                  <Input
                    placeholder="分类名称"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    maxLength={50}
                    className="h-10 rounded-xl bg-background/80 px-3.5"
                  />

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Palette className="h-3.5 w-3.5" />
                      选择颜色
                    </div>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
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
                            className="group relative flex h-10 items-center justify-center rounded-2xl border border-border/60 transition-all hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                            style={{
                              backgroundColor: preset.value,
                              boxShadow: selected ? `0 0 0 3px ${preset.value}22` : undefined,
                            }}
                          >
                            <span
                              className={`h-4 w-4 rounded-full border-2 border-white/80 bg-white/20 transition-transform ${
                                selected ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
                              }`}
                            />
                            <span
                              className={`pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-offset-2 ring-offset-background transition-opacity ${
                                selected
                                  ? 'ring-foreground/70 opacity-100'
                                  : 'ring-transparent opacity-0'
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleSave}
                      disabled={loading || !name.trim()}
                      className="h-10 flex-1 rounded-xl shadow-sm"
                    >
                      {editingId ? (
                        <>
                          <Pencil className="h-4 w-4" />
                          保存修改
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4" />
                          创建分类
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-border/70 bg-background/80 p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">已有分类</h3>
                    <p className="text-xs text-muted-foreground">
                      支持上移下移、编辑和删除分类。
                    </p>
                  </div>
                  <div className="rounded-full border border-border/60 bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
                    {categories.length} 项
                  </div>
                </div>

                <ScrollArea className="max-h-[min(52vh,30rem)] pr-2">
                  <div className="space-y-2">
                    {categories.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-center">
                        <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-background shadow-sm">
                          <Layers3 className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-medium">暂无分类</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          先创建一个分类，再回到书架给图书归类。
                        </p>
                      </div>
                    ) : (
                      categories.map((cat, index) => {
                        const isEditing = editingId === cat.id;
                        return (
                          <div
                            key={cat.id}
                            className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-all ${
                              isEditing
                                ? 'border-foreground/20 bg-muted/40 shadow-sm'
                                : 'border-border/70 bg-background hover:border-border hover:bg-muted/20'
                            }`}
                          >
                            <div
                              className="h-10 w-10 shrink-0 rounded-2xl border border-white/30 shadow-sm"
                              style={{ backgroundColor: cat.color }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{cat.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {isEditing ? '当前正在编辑' : '已创建分类'}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleMove(cat, 'up')}
                              disabled={loading || index === 0}
                              className="rounded-full hover:bg-muted"
                              title="上移"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleMove(cat, 'down')}
                              disabled={loading || index === categories.length - 1}
                              className="rounded-full hover:bg-muted"
                              title="下移"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => startEdit(cat)}
                              disabled={loading}
                              className="rounded-full hover:bg-muted"
                              title="编辑分类"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => {
                                setDeleteTarget(cat);
                                setDeleteConfirmOpen(true);
                              }}
                              disabled={loading}
                              className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                              title="删除分类"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </section>
            </div>
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
