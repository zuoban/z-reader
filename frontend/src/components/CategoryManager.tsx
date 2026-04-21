'use client';

import { useState } from 'react';
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
  SheetDescription,
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
import { getCategoryColor, getContrastColor } from '@/lib/categoryColors';

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
  const [loading, setLoading] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

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

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (nextOpen) {
      void loadCategories();
      return;
    }

    resetForm();
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
  }

  const editingCategory = categories.find((category) => category.id === editingId) ?? null;
  // 新分类的颜色根据当前分类数量计算（新增分类将是最后一个）
  const nextSortOrder = editingId ? editingCategory?.sort_order : categories.length + 1;
  const previewColor = getCategoryColor(nextSortOrder ?? categories.length + 1);
  const formTitle = editingId ? '编辑分类' : '新建分类';

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            title="管理分类"
            aria-label="管理分类"
            className="h-8 w-8 shrink-0 rounded-none border-transparent bg-transparent p-0 text-foreground shadow-none hover:bg-transparent hover:opacity-70 sm:h-9 sm:w-9 cursor-pointer"
          />
        }
      >
        <Layers3 className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
      </SheetTrigger>
      <SheetContent
        side="right"
        showCloseButton
        finalFocus={false}
        className="bg-background p-0 sm:w-[400px] sm:max-w-[400px]"
      >
        <SheetHeader className="border-0 bg-transparent px-4 pb-3 pt-4 sm:px-5">
          <div className="rounded-[1.25rem] border border-border/60 bg-gradient-to-b from-background to-muted/35 px-4 py-4 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/8 text-primary">
                <Layers3 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <SheetTitle className="text-base font-semibold tracking-tight">
                  管理分类
                </SheetTitle>
                <SheetDescription className="mt-1 text-[13px] leading-5">
                  统一整理书架分类，支持快速编辑和排序，分类体系会同步到整套书库。
                </SheetDescription>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                <Layers3 className="h-3.5 w-3.5" />
                {categories.length} 个分类
              </span>
              <span className="inline-flex items-center rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                支持拖拽排序
              </span>
              {editingCategory && (
                <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 text-[11px] font-medium text-primary">
                  正在编辑：{editingCategory.name}
                </span>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-5 px-4 pb-5 sm:px-5">
            <section className="rounded-[1.25rem] border border-border/60 bg-gradient-to-b from-background to-muted/25 shadow-[0_16px_36px_rgba(15,23,42,0.05)]">
              <div className="border-b border-border/50 px-4 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">{formTitle}</h3>
                  {editingId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={resetForm}
                      className="h-7 rounded-md text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <X className="mr-1 h-3 w-3" />
                      取消
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-3.5 px-4 py-4">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/30 text-sm font-semibold shadow-sm"
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
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Input
                    id="category-name"
                    placeholder="输入分类名称"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    maxLength={50}
                    className="h-11 rounded-xl border-border/70 bg-background px-3 text-sm transition-all focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="text-right text-xs text-muted-foreground">{name.length}/50</p>
                </div>

                <Button
                  onClick={handleSave}
                  disabled={loading || !name.trim()}
                  className="h-11 w-full rounded-xl text-sm font-medium shadow-sm transition-all active:scale-[0.98] disabled:opacity-60 cursor-pointer"
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
                <h3 className="text-sm font-semibold">已有分类</h3>
                <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                  <Layers3 className="h-3.5 w-3.5" />
                  {categories.length}
                </div>
              </div>

              <ScrollArea className="max-h-[min(45vh,24rem)] pr-1">
                <div className="space-y-2">
                  {categories.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-[1.25rem] border border-dashed border-border/70 bg-muted/20 py-9 text-center">
                      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                        <Layers3 className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium">暂无分类</p>
                      <p className="mt-1 text-xs text-muted-foreground">先创建一个分类，后续可随时调整顺序。</p>
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
                          className={`group relative flex items-center gap-3 rounded-xl border p-3 pr-2.5 shadow-sm transition-all duration-200 ${
                            isEditing
                              ? 'border-primary/40 bg-primary/5'
                              : 'border-border/60 bg-background/90 hover:border-border hover:bg-muted/35'
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
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-semibold shadow-sm"
                            style={{ backgroundColor: catColor, color: getContrastColor(catColor) }}
                          >
                            {cat.name.slice(0, 2)}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <div className="truncate text-sm font-medium">{cat.name}</div>
                              <span className="rounded border border-border/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                #{index + 1}
                              </span>
                            </div>
                            {isEditing && (
                              <div className="mt-0.5 text-xs text-primary">正在编辑</div>
                            )}
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
