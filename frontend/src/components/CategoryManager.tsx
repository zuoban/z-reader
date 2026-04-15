'use client';

import { useEffect, useState } from 'react';
import type { DragEvent } from 'react';
import { toast } from 'sonner';
import {
  ChevronUp,
  ChevronDown,
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
import { getCategoryColor, getContrastColor, toAlphaColor } from '@/lib/categoryColors';
import { useIsMobile } from '@/hooks/use-mobile';

interface CategoryManagerProps {
  onCategoryChange?: () => void;
}

export function CategoryManager({ onCategoryChange }: CategoryManagerProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
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
        await api.updateCategory(editingId, { name: trimmedName });
      } else {
        await api.createCategory({ name: trimmedName });
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

  async function handleReorder(categoryId: string, targetIndex: number) {
    const sourceIndex = categories.findIndex((cat) => cat.id === categoryId);
    if (sourceIndex === -1 || targetIndex < 0 || targetIndex >= categories.length) return;
    const previousCategories = categories;
    const nextCategories = [...categories];
    const [moved] = nextCategories.splice(sourceIndex, 1);
    nextCategories.splice(targetIndex, 0, moved);
    const reordered = nextCategories.map((cat, idx) => ({ ...cat, sort_order: idx + 1 }));
    setCategories(reordered);
    await persistCategoryOrder(previousCategories, reordered);
  }

  function startEdit(category: Category) {
    setEditingId(category.id);
    setName(category.name);
  }

  function resetForm() {
    setEditingId(null);
    setName('');
  }

  const editingCategory = categories.find((category) => category.id === editingId) ?? null;
  // 新分类的颜色根据当前分类数量计算（新增分类将是最后一个）
  const nextSortOrder = editingId ? editingCategory?.sort_order : categories.length + 1;
  const previewColor = getCategoryColor(nextSortOrder ?? categories.length + 1);
  const formTitle = editingId ? '编辑分类' : '新建分类';
  const formDescription = editingId
    ? '更新名称，让书架标签更清晰。'
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
        className="w-[100vw] max-w-[100vw] overflow-hidden rounded-none border-l border-border/60 bg-background p-0 shadow-2xl sm:w-[420px] sm:max-w-[420px] sm:rounded-l-2xl"
      >
        <SheetHeader className="border-b border-border/50 bg-background px-5 py-5 backdrop-blur">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Layers3 className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 space-y-0.5">
                <SheetTitle className="text-lg font-semibold tracking-tight">
                  管理分类
                </SheetTitle>
                <p className="text-sm text-muted-foreground">
                  创建、编辑和整理分类，让书架结构更清晰。
                </p>
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-5 p-5">
            <section className="rounded-xl border border-border bg-card shadow-sm">
              <div className="border-b border-border/50 px-4 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-semibold">{formTitle}</h3>
                    <p className="text-xs text-muted-foreground">
                      {formDescription}
                    </p>
                  </div>
                  {editingId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={resetForm}
                      className="h-7 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <X className="mr-1 h-3 w-3" />
                      取消
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-4 px-4 py-4">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/30 text-sm font-semibold shadow-sm"
                    style={{
                      backgroundColor: previewColor,
                      color: getContrastColor(previewColor),
                    }}
                  >
                    {name.trim().slice(0, 2) || '新'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {name.trim() || '未命名分类'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      颜色将根据排序位置自动生成
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Input
                    id="category-name"
                    placeholder="输入分类名称"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    maxLength={50}
                    className="h-10 rounded-lg border-border/60 bg-background px-3.5 text-sm shadow-sm transition-all focus:ring-2 focus:ring-primary/20"
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <p>建议使用简洁主题词，例如"文学""设计""在读"。</p>
                    <p>{name.length}/50</p>
                  </div>
                </div>

                <Button
                  onClick={handleSave}
                  disabled={loading || !name.trim()}
                  className="h-10 w-full rounded-lg text-sm font-medium shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/25 active:scale-[0.98] disabled:opacity-60 disabled:shadow-none cursor-pointer"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      {editingId ? '保存中...' : '创建中...'}
                    </span>
                  ) : editingId ? (
                    <>
                      <Pencil className="mr-2 h-4 w-4" />
                      保存修改
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      创建分类
                    </>
                  )}
                </Button>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-semibold">已有分类</h3>
                  <p className="text-xs text-muted-foreground">
                    {isMobile ? '使用箭头调整顺序，编辑或删除。' : '拖动手柄调整顺序，编辑或删除。'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  <Layers3 className="h-3.5 w-3.5" />
                  {categories.length}
                </div>
              </div>

              <ScrollArea className="max-h-[min(45vh,24rem)] pr-1">
                <div className="space-y-2">
                  {categories.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/60 bg-muted/30 py-10 text-center">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-background shadow-sm ring-1 ring-border/50">
                        <Layers3 className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="mb-1 text-sm font-medium">暂无分类</p>
                      <p className="max-w-[200px] text-xs text-muted-foreground">
                        创建一个分类来整理你的书籍
                      </p>
                    </div>
                  ) : (
                    categories.map((cat, index) => {
                      const isEditing = editingId === cat.id;
                      const isDragging = draggingId === cat.id;
                      const isDropTarget = dropTargetId === cat.id && draggingId !== cat.id;
                      const catColor = getCategoryColor(cat.sort_order);
                      return (
                        <div
                          key={cat.id}
                          draggable={!loading}
                          onDragStart={(event) => handleDragStart(event, cat.id)}
                          onDragOver={(event) => handleDragOver(event, cat.id)}
                          onDrop={(event) => void handleDrop(event, cat.id)}
                          onDragEnd={handleDragEnd}
                          className={`group relative flex items-center gap-3 rounded-lg border p-2.5 pr-2.5 transition-all duration-200 ${
                            isEditing
                              ? 'border-primary/30 bg-primary/5 shadow-sm'
                              : 'border-border/60 bg-card hover:border-border hover:shadow-sm'
                          }`}
                          style={{
                            opacity: isDragging ? 0.5 : 1,
                            transform: isDragging ? 'scale(0.98)' : undefined,
                          }}
                        >
                          {isDropTarget && (
                            <div className="pointer-events-none absolute inset-x-2 -top-0.5 h-0.5 rounded-full bg-primary/70" />
                          )}
                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-semibold shadow-sm"
                            style={{ backgroundColor: catColor, color: getContrastColor(catColor) }}
                          >
                            {cat.name.slice(0, 2)}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <div className="truncate text-sm font-medium">{cat.name}</div>
                              <span className="rounded-full border border-border/40 bg-background/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                #{index + 1}
                              </span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                              {isEditing ? (
                                <span className="flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-primary">
                                  <Pencil className="h-2.5 w-2.5" />
                                  正在编辑
                                </span>
                              ) : (
                                <>
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: catColor }}
                                  />
                                  <span>排序位 {cat.sort_order}</span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="hidden sm:flex items-center opacity-60 transition-opacity group-hover:opacity-100">
                            <span
                              className={cn(
                                'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground',
                                loading ? 'cursor-not-allowed opacity-50' : 'cursor-grab active:cursor-grabbing'
                              )}
                              title="拖动排序"
                            >
                              <Grip className="h-3.5 w-3.5" />
                            </span>
                          </div>

                          {/* 移动端上下箭头排序 */}
                          <div className="flex flex-col gap-0.5 sm:hidden">
                            <button
                              type="button"
                              disabled={loading || index === 0}
                              onClick={() => void handleReorder(cat.id, index - 1)}
                              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground disabled:opacity-30 cursor-pointer"
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={loading || index === categories.length - 1}
                              onClick={() => void handleReorder(cat.id, index + 1)}
                              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground disabled:opacity-30 cursor-pointer"
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <DropdownMenu>
                            <DropdownMenuTrigger
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background/70 opacity-100 transition hover:bg-muted sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-36 rounded-lg p-1">
                              <DropdownMenuItem
                                onClick={() => startEdit(cat)}
                                disabled={loading}
                                className="flex items-center gap-2 rounded-md px-2.5 py-2 cursor-pointer"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                <span>编辑</span>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="my-1" />
                              <DropdownMenuItem
                                onClick={() => {
                                  setDeleteTarget(cat);
                                  setDeleteConfirmOpen(true);
                                }}
                                disabled={loading}
                                className="flex items-center gap-2 rounded-md px-2.5 py-2 text-destructive focus:bg-destructive/10 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>删除</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      );
                    })
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
