'use client';

import type { FormEvent } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { ActionIcon, Button, Modal, TextInput } from '@mantine/core';
import { toast } from 'sonner';
import { Loader2, Pencil, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const MAX_METADATA_RUNES = 500;
const WARN_METADATA_RUNES = 450;

interface BookMetadataDialogProps {
  bookId: string;
  currentTitle?: string;
  currentAuthor?: string;
  onUpdate: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function countRunes(value: string): number {
  return Array.from(value).length;
}

export function BookMetadataDialog({
  bookId,
  currentTitle,
  currentAuthor,
  onUpdate,
  open,
  onOpenChange,
}: BookMetadataDialogProps) {
  const titleInputRef = useRef<HTMLInputElement>(null);
  const authorInputRef = useRef<HTMLInputElement>(null);
  const titleErrorId = useId();

  const normalizedCurrentTitle = currentTitle?.trim() ?? '';
  const normalizedCurrentAuthor = currentAuthor?.trim() ?? '';

  const [title, setTitle] = useState(normalizedCurrentTitle);
  const [author, setAuthor] = useState(normalizedCurrentAuthor);
  const [saving, setSaving] = useState(false);

  const trimmedTitle = title.trim();
  const trimmedAuthor = author.trim();
  const titleRunes = countRunes(title);
  const authorRunes = countRunes(author);
  const titleChanged = trimmedTitle !== normalizedCurrentTitle;
  const authorChanged = trimmedAuthor !== normalizedCurrentAuthor;
  const isUnchanged = !titleChanged && !authorChanged;
  const isTitleMissing = trimmedTitle.length === 0;
  const isTitleTooLong = countRunes(trimmedTitle) > MAX_METADATA_RUNES;
  const isAuthorTooLong = countRunes(trimmedAuthor) > MAX_METADATA_RUNES;
  const canSubmit = !saving && !isUnchanged && !isTitleMissing && !isTitleTooLong && !isAuthorTooLong;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setTitle(normalizedCurrentTitle);
      setAuthor(normalizedCurrentAuthor);
      setSaving(false);
    });
    return () => {
      cancelled = true;
    };
  }, [normalizedCurrentAuthor, normalizedCurrentTitle, open]);

  useEffect(() => {
    if (!open) return;

    function handleComposingEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && event.isComposing) {
        event.stopPropagation();
      }
    }

    window.addEventListener('keydown', handleComposingEscape, true);
    return () => window.removeEventListener('keydown', handleComposingEscape, true);
  }, [open]);

  function handleClose() {
    if (saving) return;
    onOpenChange(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || isUnchanged) return;

    if (isTitleMissing) {
      toast.error('书名不能为空');
      titleInputRef.current?.focus();
      return;
    }
    if (isTitleTooLong) {
      toast.error(`书名不能超过 ${MAX_METADATA_RUNES} 个字符`);
      titleInputRef.current?.focus();
      return;
    }
    if (isAuthorTooLong) {
      toast.error(`作者不能超过 ${MAX_METADATA_RUNES} 个字符`);
      authorInputRef.current?.focus();
      return;
    }

    const payload: { title?: string; author?: string } = {};
    if (titleChanged) payload.title = trimmedTitle;
    if (authorChanged) payload.author = trimmedAuthor;

    setSaving(true);
    try {
      await api.updateBook(bookId, payload);
      toast.success('已更新书籍信息');
      onUpdate();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存书籍信息失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal.Root
      opened={open}
      onClose={handleClose}
      centered
      size={440}
      radius="lg"
      padding={0}
      zIndex={80}
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
      classNames={{
        inner:
          'pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]',
        content:
          'app-dialog-shell flex max-h-[min(82svh,34rem)] flex-col overflow-hidden overscroll-contain rounded-2xl border p-0',
      }}
    >
      <Modal.Overlay backgroundOpacity={0.42} blur={3} />
      <Modal.Content>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="app-sheet-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/15">
              <Pencil className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <Modal.Title className="font-heading text-[17px] font-medium leading-tight text-foreground">
                编辑书籍信息
              </Modal.Title>
              <p className="mt-0.5 truncate text-xs leading-5 text-muted-foreground">
                修改书名或作者，便于书架检索与整理
              </p>
            </div>
          </div>
          <ActionIcon
            variant="subtle"
            color="gray"
            size={36}
            radius="md"
            onClick={handleClose}
            disabled={saving}
            className="dialog-close-btn -mr-1 h-9 w-9"
            aria-label="关闭"
            title="关闭 (Esc)"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </ActionIcon>
        </div>

        <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={handleSubmit}>
          <div className="custom-scrollbar min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4 sm:px-6">
            <div className="app-surface-panel rounded-xl px-4 py-3.5">
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor={`${titleErrorId}-input`} className="text-xs font-medium text-muted-foreground">
                  书名
                </label>
                <span
                  className={cn(
                    'font-mono text-[11px] tabular-nums transition-colors',
                    titleRunes > MAX_METADATA_RUNES
                      ? 'font-medium text-destructive'
                      : titleRunes >= WARN_METADATA_RUNES
                        ? 'font-medium text-primary'
                        : 'text-muted-foreground/75'
                  )}
                >
                  {titleRunes}/{MAX_METADATA_RUNES}
                </span>
              </div>
              <TextInput
                id={`${titleErrorId}-input`}
                ref={titleInputRef}
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing && event.key === 'Enter') {
                    event.preventDefault();
                  }
                }}
                maxLength={MAX_METADATA_RUNES}
                placeholder="输入书名"
                aria-label="书名"
                aria-invalid={isTitleMissing || isTitleTooLong || undefined}
                aria-describedby={isTitleMissing ? titleErrorId : undefined}
                disabled={saving}
                rightSection={
                  title ? (
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size={32}
                      radius="sm"
                      disabled={saving}
                      onClick={() => {
                        setTitle('');
                        titleInputRef.current?.focus();
                      }}
                      className="cursor-pointer text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-secondary hover:text-foreground active:scale-95 motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45"
                      title="清空书名"
                      aria-label="清空书名"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </ActionIcon>
                  ) : null
                }
                rightSectionWidth={40}
                classNames={{
                  input: 'category-input h-10 rounded-lg px-3 text-base shadow-none sm:text-sm',
                }}
              />
              {isTitleMissing && (
                <p id={titleErrorId} role="alert" className="mt-2 text-xs font-medium text-destructive">
                  书名不能为空
                </p>
              )}
            </div>

            <div className="app-surface-panel rounded-xl px-4 py-3.5">
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor={`${titleErrorId}-author`} className="text-xs font-medium text-muted-foreground">
                  作者
                </label>
                <span
                  className={cn(
                    'font-mono text-[11px] tabular-nums transition-colors',
                    authorRunes > MAX_METADATA_RUNES
                      ? 'font-medium text-destructive'
                      : authorRunes >= WARN_METADATA_RUNES
                        ? 'font-medium text-primary'
                        : 'text-muted-foreground/75'
                  )}
                >
                  {authorRunes}/{MAX_METADATA_RUNES}
                </span>
              </div>
              <TextInput
                id={`${titleErrorId}-author`}
                ref={authorInputRef}
                value={author}
                onChange={(event) => setAuthor(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing && event.key === 'Enter') {
                    event.preventDefault();
                  }
                }}
                maxLength={MAX_METADATA_RUNES}
                placeholder="输入作者（留空将显示未知作者）"
                aria-label="作者"
                aria-invalid={isAuthorTooLong || undefined}
                disabled={saving}
                rightSection={
                  author ? (
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size={32}
                      radius="sm"
                      disabled={saving}
                      onClick={() => {
                        setAuthor('');
                        authorInputRef.current?.focus();
                      }}
                      className="cursor-pointer text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-secondary hover:text-foreground active:scale-95 motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45"
                      title="清空作者"
                      aria-label="清空作者"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </ActionIcon>
                  ) : null
                }
                rightSectionWidth={40}
                classNames={{
                  input: 'category-input h-10 rounded-lg px-3 text-base shadow-none sm:text-sm',
                }}
              />
            </div>
          </div>

          <div className="app-dialog-footer flex shrink-0 items-center justify-end gap-2 px-5 py-3.5 sm:px-6">
            <Button
              type="button"
              variant="subtle"
              color="gray"
              disabled={saving}
              onClick={handleClose}
              className="h-9 rounded-lg px-3.5 text-sm font-medium text-muted-foreground transition-[background-color,color,transform] duration-150 active:scale-[0.98] motion-reduce:active:scale-100"
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              aria-busy={saving || undefined}
              leftSection={
                saving ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                ) : undefined
              }
              className="h-9 rounded-lg px-4 text-sm font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.98] motion-reduce:active:scale-100"
            >
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </form>
      </Modal.Content>
    </Modal.Root>
  );
}
