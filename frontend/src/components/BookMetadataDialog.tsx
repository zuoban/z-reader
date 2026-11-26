'use client';

import type { ChangeEvent, DragEvent, FormEvent } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { ActionIcon, Button, TextInput } from '@mantine/core';
import { toast } from 'sonner';
import { ImagePlus, Loader2, Pencil, RotateCcw, Trash2, X } from 'lucide-react';
import { AppModal } from '@/components/AppModal';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const MAX_METADATA_RUNES = 500;
const WARN_METADATA_RUNES = 450;
const MAX_COVER_BYTES = 10 * 1024 * 1024;
const COVER_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';
const ACCEPTED_COVER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ACCEPTED_COVER_EXTENSIONS = /\.(jpe?g|png|webp)$/i;

interface BookMetadataDialogProps {
  bookId: string;
  currentTitle?: string;
  currentAuthor?: string;
  currentCoverUrl?: string | null;
  onUpdate: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function countRunes(value: string): number {
  return Array.from(value).length;
}

function formatCoverSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
}

function validateCoverFile(file: File): string | null {
  if (file.size <= 0) {
    return '所选封面文件为空';
  }
  if (file.size > MAX_COVER_BYTES) {
    return '封面图片不能超过 10 MB';
  }
  const normalizedType = file.type.trim().toLowerCase();
  const hasAllowedType = normalizedType !== '' && ACCEPTED_COVER_TYPES.has(normalizedType);
  const hasAllowedExt = ACCEPTED_COVER_EXTENSIONS.test(file.name);
  if (!hasAllowedType && !hasAllowedExt) {
    return '仅支持 JPG、PNG 或 WebP 格式的封面图片';
  }
  return null;
}

export function BookMetadataDialog({
  bookId,
  currentTitle,
  currentAuthor,
  currentCoverUrl,
  onUpdate,
  open,
  onOpenChange,
}: BookMetadataDialogProps) {
  const titleInputRef = useRef<HTMLInputElement>(null);
  const authorInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const titleErrorId = useId();
  const coverErrorId = useId();

  const normalizedCurrentTitle = currentTitle?.trim() ?? '';
  const normalizedCurrentAuthor = currentAuthor?.trim() ?? '';

  const [title, setTitle] = useState(normalizedCurrentTitle);
  const [author, setAuthor] = useState(normalizedCurrentAuthor);
  const [pendingCover, setPendingCover] = useState<{ file: File; previewUrl: string } | null>(null);
  const [pendingRemoveCover, setPendingRemoveCover] = useState(false);
  const [isDraggingCover, setIsDraggingCover] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const wasOpenRef = useRef(open);
  const pendingCoverRef = useRef<{ file: File; previewUrl: string } | null>(null);

  const pendingCoverFile = pendingCover?.file ?? null;
  const hasExistingCover = Boolean(currentCoverUrl);
  const trimmedTitle = title.trim();
  const trimmedAuthor = author.trim();
  const titleRunes = countRunes(title);
  const authorRunes = countRunes(author);
  const titleChanged = trimmedTitle !== normalizedCurrentTitle;
  const authorChanged = trimmedAuthor !== normalizedCurrentAuthor;
  const hasCoverChange = pendingCoverFile !== null || pendingRemoveCover;
  const isUnchanged = !titleChanged && !authorChanged && !hasCoverChange;
  const isTitleMissing = trimmedTitle.length === 0;
  const isTitleTooLong = countRunes(trimmedTitle) > MAX_METADATA_RUNES;
  const isAuthorTooLong = countRunes(trimmedAuthor) > MAX_METADATA_RUNES;
  const canSubmit = !saving && !isUnchanged && !isTitleMissing && !isTitleTooLong && !isAuthorTooLong;
  const previewCoverUrl = pendingCover?.previewUrl ?? (pendingRemoveCover ? null : currentCoverUrl ?? null);

  useEffect(() => {
    pendingCoverRef.current = pendingCover;
  }, [pendingCover]);

  useEffect(() => {
    return () => {
      if (pendingCoverRef.current) {
        URL.revokeObjectURL(pendingCoverRef.current.previewUrl);
        pendingCoverRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (!justOpened) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setTitle(normalizedCurrentTitle);
      setAuthor(normalizedCurrentAuthor);
      setPendingCover((prev) => {
        if (prev) URL.revokeObjectURL(prev.previewUrl);
        return null;
      });
      setPendingRemoveCover(false);
      setIsDraggingCover(false);
      setCoverError(null);
      setSaving(false);
    });
    return () => {
      cancelled = true;
    };
  }, [normalizedCurrentAuthor, normalizedCurrentTitle, open]);

  function handleClose() {
    if (saving) return;
    onOpenChange(false);
  }

  function stageCoverFile(file: File) {
    const validationError = validateCoverFile(file);
    if (validationError) {
      setCoverError(validationError);
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setCoverError(null);
    setPendingRemoveCover(false);
    setPendingCover((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return { file, previewUrl };
    });
  }

  function handleCoverFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    stageCoverFile(file);
  }

  function handleClearPendingCover() {
    if (saving) return;
    setPendingCover((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setCoverError(null);
  }

  function handleRemoveCover() {
    if (saving) return;
    setPendingRemoveCover(true);
    setCoverError(null);
  }

  function handleRestoreCover() {
    if (saving) return;
    setPendingRemoveCover(false);
    setCoverError(null);
  }

  function handleCoverDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (saving) return;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    if (!isDraggingCover) {
      setIsDraggingCover(true);
    }
  }

  function handleCoverDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDraggingCover(false);
  }

  function handleCoverDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingCover(false);
    if (saving) return;
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    stageCoverFile(file);
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
    const hasMetadataChange = titleChanged || authorChanged;
    const coverToUpload = pendingCoverFile;
    const shouldRemoveCover = !coverToUpload && pendingRemoveCover;

    setSaving(true);
    let metadataSaved = false;
    try {
      if (hasMetadataChange) {
        await api.updateBook(bookId, payload);
        metadataSaved = true;
      }
      if (coverToUpload) {
        await api.uploadCover(bookId, coverToUpload, coverToUpload.name || 'cover.png');
      } else if (shouldRemoveCover) {
        await api.deleteBookCover(bookId);
      }
      if (hasMetadataChange && (coverToUpload || shouldRemoveCover)) {
        toast.success('已更新书籍信息与封面');
      } else if (coverToUpload) {
        toast.success('已更新书籍封面');
      } else if (shouldRemoveCover) {
        toast.success('封面已移除');
      } else {
        toast.success('已更新书籍信息');
      }
      onUpdate();
      onOpenChange(false);
    } catch (err) {
      if (metadataSaved) {
        onUpdate();
      }
      toast.error(
        err instanceof Error
          ? err.message
          : metadataSaved || (!hasMetadataChange && (coverToUpload || shouldRemoveCover))
            ? shouldRemoveCover
              ? '移除封面失败'
              : '上传封面失败'
            : '保存书籍信息失败'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal
      open={open}
      onClose={handleClose}
      title="编辑书籍信息"
      subtitle="修改书名、作者或自定义封面，便于书架检索与整理"
      icon={<Pencil className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" />}
      closeDisabled={saving}
      contentClassName="max-h-[min(86svh,40rem)]"
    >
      <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={handleSubmit}>
          <div className="custom-scrollbar min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4 sm:px-6">
            <div
              data-cover-dropzone="true"
              data-dragging={isDraggingCover ? 'true' : undefined}
              onDragOver={handleCoverDragOver}
              onDragLeave={handleCoverDragLeave}
              onDrop={handleCoverDrop}
              className={cn(
                'app-surface-panel rounded-xl px-4 py-3.5 transition-[border-color,background-color,box-shadow] duration-150',
                isDraggingCover && 'border-primary bg-primary/5 ring-2 ring-primary/20'
              )}
            >
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">封面</span>
                {pendingCoverFile ? (
                  <span className="rounded-md bg-primary/12 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                    待保存
                  </span>
                ) : pendingRemoveCover ? (
                  <span className="rounded-md border border-destructive/30 bg-card px-1.5 py-0.5 text-[11px] font-medium text-destructive">
                    待移除
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-3.5">
                <div
                  data-cover-preview="true"
                  className={cn(
                    'relative flex h-[4.5rem] w-[3rem] shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/80 bg-secondary/50 transition-colors',
                    isDraggingCover && 'border-primary bg-primary/10'
                  )}
                >
                  {previewCoverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewCoverUrl}
                      alt={trimmedTitle ? `${trimmedTitle} 封面预览` : '封面预览'}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImagePlus
                      className="h-4 w-4 text-muted-foreground/70"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  <p className="truncate text-xs text-muted-foreground" title={pendingCoverFile?.name}>
                    {pendingCoverFile
                      ? `${pendingCoverFile.name}（${formatCoverSize(pendingCoverFile.size)}）`
                      : pendingRemoveCover
                        ? '保存后将移除当前封面'
                        : isDraggingCover
                          ? '松开以替换封面图片'
                          : '支持 JPG、PNG、WebP，可拖拽上传，不超过 10 MB'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={coverInputRef}
                      type="file"
                      accept={COVER_ACCEPT}
                      aria-label="选择封面图片"
                      aria-describedby={coverError ? coverErrorId : undefined}
                      tabIndex={-1}
                      disabled={saving}
                      onChange={handleCoverFileChange}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="default"
                      size="xs"
                      disabled={saving}
                      onClick={() => coverInputRef.current?.click()}
                      leftSection={
                        <ImagePlus className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
                      }
                      className="h-8 rounded-lg border-border/80 bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary/75"
                    >
                      {previewCoverUrl ? '更换封面' : '选择封面'}
                    </Button>
                    {pendingCoverFile && (
                      <Button
                        type="button"
                        variant="subtle"
                        color="gray"
                        size="xs"
                        disabled={saving}
                        onClick={handleClearPendingCover}
                        leftSection={
                          <RotateCcw className="h-3 w-3" strokeWidth={1.6} aria-hidden="true" />
                        }
                        className="h-8 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        取消更换
                      </Button>
                    )}
                    {hasExistingCover && !pendingCoverFile && !pendingRemoveCover && (
                      <Button
                        type="button"
                        variant="subtle"
                        color="gray"
                        size="xs"
                        disabled={saving}
                        onClick={handleRemoveCover}
                        leftSection={
                          <Trash2 className="h-3 w-3" strokeWidth={1.6} aria-hidden="true" />
                        }
                        className="h-8 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        移除封面
                      </Button>
                    )}
                    {hasExistingCover && !pendingCoverFile && pendingRemoveCover && (
                      <Button
                        type="button"
                        variant="subtle"
                        color="gray"
                        size="xs"
                        disabled={saving}
                        onClick={handleRestoreCover}
                        leftSection={
                          <RotateCcw className="h-3 w-3" strokeWidth={1.6} aria-hidden="true" />
                        }
                        className="h-8 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        恢复原封面
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              {coverError && (
                <p id={coverErrorId} role="alert" className="mt-2 text-xs font-medium text-destructive">
                  {coverError}
                </p>
              )}
            </div>

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
                        : 'text-muted-foreground'
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
                        : 'text-muted-foreground'
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
    </AppModal>
  );
}
