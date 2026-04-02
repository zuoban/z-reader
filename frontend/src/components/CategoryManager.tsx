'use client';

import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { api, Category } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const DEFAULT_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
  '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6',
];

interface CategoryManagerProps {
  onCategoryChange?: () => void;
}

export function CategoryManager({ onCategoryChange }: CategoryManagerProps) {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_COLORS[0]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadCategories();
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
        await api.updateCategory(editingId, { name, color });
      } else {
        await api.createCategory({ name, color });
      }
      await loadCategories();
      onCategoryChange?.();
      resetForm();
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败');
    }
    setLoading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('确定删除此分类？相关图书的分类将被清空。')) return;
    setLoading(true);
    try {
      await api.deleteCategory(id);
      await loadCategories();
      onCategoryChange?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败');
    }
    setLoading(false);
  }

  function startEdit(category: Category) {
    setEditingId(category.id);
    setName(category.name);
    setColor(category.color);
  }

  function resetForm() {
    setEditingId(null);
    setName('');
    setColor(DEFAULT_COLORS[0]);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="h-9 rounded-full border border-border/70 bg-background px-4 text-sm shadow-none hover:bg-muted transition-colors">
        管理分类
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>管理分类</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-3">
            <Input
              placeholder="分类名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              maxLength={50}
            />
            <div className="flex gap-2">
              {DEFAULT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="h-8 w-8 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? '#000' : 'transparent',
                    transform: color === c ? 'scale(1.1)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={loading || !name.trim()} className="flex-1">
                {editingId ? '更新' : '创建'}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={resetForm}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2 border-t pt-4">
            {categories.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">暂无分类</p>
            ) : (
              categories.map((cat) => (
                <div key={cat.id} className="flex items-center gap-2 rounded-lg border p-2">
                  <div className="h-4 w-4 rounded-full" style={{ backgroundColor: cat.color }} />
                  <span className="flex-1 text-sm">{cat.name}</span>
                  <Button variant="ghost" size="sm" onClick={() => startEdit(cat)} className="h-7 w-7 p-0">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(cat.id)} className="h-7 w-7 p-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}



