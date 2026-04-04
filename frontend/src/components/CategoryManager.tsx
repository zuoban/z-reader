'use client';

import { useEffect, useState } from 'react';
import type { DragEvent } from 'react';
import { toast } from 'sonner';
import {
  Check,
  Grip,
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
import { cn } from '@/lib/utils';
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

function toAlphaColor(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;

  if (value.length !== 6) return hex;

  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

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

  async function persistCategoryOrder(previousCategories: Category[], nextCategories: Category[]) {
    const previousSortMap = new Map(
      previousCategories.map((category) => [category.id, category.sort_order])
    );
    const updates = nextCategories.filter(
      (category, index) => previousSortMap.get(category.id) !== index + 1
    );

    if (updates.length === 0) return;

    setLoading(true);
    try {
      await Promise.all(
        updates.map((category) => {
          const nextIndex = nextCategories.findIndex((item) => item.id === category.id);
          return api.updateCategory(category.id, { sort_order: nextIndex + 1 });
        })
      );

      setCategories(
        nextCategories.map((category, index) => ({
          ...category,
          sort_order: index + 1,
        }))
      );
      onCategoryChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '排序失败');
      await loadCategories();
    } finally {
      setLoading(false);
    }
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>, categoryId: string) {
    if (loading) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', categoryId);
    setDraggingId(categoryId);
    setDropTargetId(categoryId);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>, categoryId: string) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    if (categoryId !== dropTargetId) {
      setDropTargetId(categoryId);
    }
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>, targetCategoryId: string) {
    event.preventDefault();

    const sourceCategoryId = draggingId ?? event.dataTransfer.getData('text/plain');
    if (!sourceCategoryId || sourceCategoryId === targetCategoryId) {
      setDraggingId(null);
      setDropTargetId(null);
      return;
    }

    const sourceIndex = categories.findIndex((category) => category.id === sourceCategoryId);
    const targetIndex = categories.findIndex((category) => category.id === targetCategoryId);
    if (sourceIndex === -1 || targetIndex === -1) {
      setDraggingId(null);
      setDropTargetId(null);
      return;
    }

    const previousCategories = categories;
    const nextCategories = [...categories];
    const [movedCategory] = nextCategories.splice(sourceIndex, 1);
    nextCategories.splice(targetIndex, 0, movedCategory);

    const reorderedCategories = nextCategories.map((category, index) => ({
      ...category,
      sort_order: index + 1,
    }));

    setCategories(reorderedCategories);
    setDraggingId(null);
    setDropTargetId(null);
    await persistCategoryOrder(previousCategories, reorderedCategories);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDropTargetId(null);
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

  const selectedPreset =
    CATEGORY_COLOR_PRESETS.find((preset) => preset.value === color) ?? CATEGORY_COLOR_PRESETS[0];
  const editingCategory = categories.find((category) => category.id === editingId) ?? null;
  const formTitle = editingId ? '编辑分类' : '新建分类';
  const formDescription = editingId
    ? '更新名称或颜色，让书架标签更清晰。'
    : '为一组书建立专属入口，稍后可以继续调整顺序。';

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
        className="w-[100vw] max-w-[100vw] overflow-hidden rounded-none border-l border-border/60 bg-[radial-gradient(circle_at_top,_rgba(212,175,55,0.14),_transparent_34%),linear-gradient(180deg,_rgba(250,250,250,0.98)_0%,_rgba(245,245,245,0.96)_100%)] p-0 shadow-2xl dark:bg-[radial-gradient(circle_at_top,_rgba(212,175,55,0.10),_transparent_34%),linear-gradient(180deg,_rgba(23,23,23,0.98)_0%,_rgba(10,10,10,0.98)_100%)] sm:w-[500px] sm:max-w-[500px] sm:rounded-l-[32px]"
      >
        <SheetHeader className="border-b border-border/50 bg-background/70 px-6 py-6 backdrop-blur">
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[1.25rem] bg-primary/10 shadow-sm ring-1 ring-border/40">
                <Layers3 className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 space-y-1">
                <SheetTitle className="text-xl font-semibold tracking-tight">
                  管理分类
                </SheetTitle>
                <p className="text-sm leading-6 text-muted-foreground">
                  创建、编辑和整理分类，让书架结构更清晰。
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[1.5rem] border border-border/60 bg-card/80 px-4 py-3 shadow-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  分类总数
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{categories.length}</p>
              </div>
              <div className="rounded-[1.5rem] border border-border/60 bg-card/80 px-4 py-3 shadow-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  当前状态
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {editingCategory ? `正在编辑 ${editingCategory.name}` : '准备创建新分类'}
                </p>
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-6 p-6">
            <section
              className="overflow-hidden rounded-[2rem] border border-border/60 bg-card/90 shadow-[0_18px_40px_rgba(23,23,23,0.08)] transition-all duration-300"
              style={{
                backgroundImage: `linear-gradient(135deg, ${toAlphaColor(color, 0.14)}, transparent 48%)`,
              }}
            >
              <div className="border-b border-border/50 px-5 py-4">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold">{formTitle}</h3>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {formDescription}
                    </p>
                  </div>
                  {editingId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={resetForm}
                      className="gap-1.5 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                      取消
                    </Button>
                  )}
                </div>

                <div
                  className="flex items-center gap-3 rounded-[1.5rem] border border-white/40 px-4 py-3 shadow-sm backdrop-blur"
                  style={{ backgroundColor: toAlphaColor(color, 0.12) }}
                >
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.15rem] border border-white/40 text-sm font-semibold shadow-sm"
                    style={{
                      backgroundColor: color,
                      color: getContrastColor(color),
                    }}
                  >
                    {(name.trim() || selectedPreset.name).slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {name.trim() || '未命名分类'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      色彩方案 · {selectedPreset.name}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-5 px-5 py-5">
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
                    className="h-12 rounded-2xl border-white/60 bg-background/90 px-4 text-base shadow-sm transition-all focus:ring-2 focus:ring-primary/20"
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <p>建议使用简洁主题词，例如“文学”“设计”“在读”。</p>
                    <p>{name.length}/50</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">选择颜色</label>
                    <div
                      className="flex items-center gap-2 rounded-full border border-border/60 px-3 py-1.5 shadow-sm"
                      style={{ backgroundColor: toAlphaColor(color, 0.12) }}
                    >
                      <div
                        className="h-3.5 w-3.5 rounded-full border border-white/40 shadow-sm"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs font-medium" style={{ color }}>
                        {selectedPreset.name}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                          className={cn(
                            'group relative flex h-14 items-center justify-between rounded-[1.25rem] border px-3 transition-all duration-200',
                            'hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                            selected
                              ? 'border-foreground/20 shadow-md'
                              : 'border-border/60 bg-background/70'
                          )}
                          style={{
                            background: `linear-gradient(135deg, ${toAlphaColor(preset.value, 0.18)}, transparent 70%)`,
                          }}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className="h-8 w-8 rounded-xl border border-white/40 shadow-sm"
                              style={{ backgroundColor: preset.value }}
                            />
                            <span className="text-sm font-medium text-foreground">
                              {preset.name}
                            </span>
                          </span>
                          <span
                            className={cn(
                              'flex h-7 w-7 items-center justify-center rounded-full border transition-all duration-200',
                              selected
                                ? 'border-foreground/10 bg-background/80 shadow-sm'
                                : 'border-transparent bg-transparent'
                            )}
                          >
                            {selected && <Check className="h-4 w-4 text-foreground" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Button
                  onClick={handleSave}
                  disabled={loading || !name.trim()}
                  className="h-12 w-full rounded-2xl text-base font-medium shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/25 active:scale-[0.98] disabled:opacity-60 disabled:shadow-none cursor-pointer"
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

            <section className="rounded-[2rem] border border-border/60 bg-card/90 p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold">已有分类</h3>
                  <p className="text-sm leading-6 text-muted-foreground">
                    直接拖动手柄即可调整顺序，也可以继续编辑或删除。
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
                    <div className="flex flex-col items-center justify-center rounded-[1.75rem] border-2 border-dashed border-border/60 bg-[linear-gradient(180deg,rgba(245,245,245,0.6),rgba(250,250,250,0.95))] py-12 text-center transition-all dark:bg-[linear-gradient(180deg,rgba(38,38,38,0.6),rgba(23,23,23,0.95))]">
                      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-background shadow-sm ring-1 ring-border/50">
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
                        const isDragging = draggingId === cat.id;
                        const isDropTarget = dropTargetId === cat.id && draggingId !== cat.id;
                        return (
                          <div
                            key={cat.id}
                            draggable={!loading}
                            onDragStart={(event) => handleDragStart(event, cat.id)}
                            onDragOver={(event) => handleDragOver(event, cat.id)}
                            onDrop={(event) => void handleDrop(event, cat.id)}
                            onDragEnd={handleDragEnd}
                            className={`group relative flex items-center gap-4 rounded-[1.5rem] border p-3 pr-3 transition-all duration-200 ${
                              isEditing
                                ? 'border-primary/30 bg-primary/5 shadow-md shadow-primary/10'
                                : 'border-border/50 bg-background/90 hover:-translate-y-0.5 hover:border-border hover:shadow-md hover:bg-muted/20'
                            }`}
                            style={{
                              backgroundImage: `linear-gradient(135deg, ${toAlphaColor(cat.color, isEditing ? 0.16 : 0.1)}, transparent 58%)`,
                              opacity: isDragging ? 0.48 : 1,
                              transform: isDragging ? 'scale(0.985)' : undefined,
                            }}
                          >
                            {isDropTarget && (
                              <div className="pointer-events-none absolute inset-x-3 -top-1 h-1 rounded-full bg-primary/70 shadow-[0_0_0_4px_rgba(23,23,23,0.04)]" />
                            )}
                            <div
                              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.15rem] border border-white/40 text-sm font-semibold shadow-sm transition-transform group-hover:scale-105"
                              style={{ backgroundColor: cat.color, color: getContrastColor(cat.color) }}
                            >
                              {cat.name.slice(0, 2)}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <div className="truncate text-base font-medium">{cat.name}</div>
                                <span className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                  #{index + 1}
                                </span>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                {isEditing ? (
                                  <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                                    <Pencil className="h-3 w-3" />
                                    正在编辑
                                  </span>
                                ) : (
                                  <>
                                    <span
                                      className="h-2.5 w-2.5 rounded-full"
                                      style={{ backgroundColor: cat.color }}
                                    />
                                    <span>排序位 {cat.sort_order}</span>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="hidden items-center opacity-60 transition-opacity group-hover:opacity-100 sm:flex">
                              <span
                                className={cn(
                                  'flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground',
                                  loading ? 'cursor-not-allowed opacity-50' : 'cursor-grab active:cursor-grabbing'
                                )}
                                title="拖动排序"
                              >
                                <Grip className="h-4 w-4" />
                              </span>
                            </div>

                            <DropdownMenu>
                              <DropdownMenuTrigger
                                className="flex h-9 w-9 items-center justify-center rounded-xl bg-background/70 opacity-100 transition hover:bg-muted sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
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
