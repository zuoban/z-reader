'use client';

import type { DragEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseShelfFileDropOptions {
  canDropBookFiles: boolean;
  isUploading: boolean;
  onUploadFiles: (files: FileList) => void | Promise<void>;
}

export function useShelfFileDrop({
  canDropBookFiles,
  isUploading,
  onUploadFiles,
}: UseShelfFileDropOptions) {
  const [isDraggingBookFile, setIsDraggingBookFile] = useState(false);
  const dragDepthRef = useRef(0);

  const resetDragState = useCallback(() => {
    dragDepthRef.current = 0;
    setIsDraggingBookFile(false);
  }, []);

  useEffect(() => {
    if (!isDraggingBookFile) return;

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        resetDragState();
      }
    };

    window.addEventListener('dragend', resetDragState);
    window.addEventListener('drop', resetDragState);
    window.addEventListener('blur', resetDragState);
    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('dragend', resetDragState);
      window.removeEventListener('drop', resetDragState);
      window.removeEventListener('blur', resetDragState);
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [isDraggingBookFile, resetDragState]);

  function handleShelfDragEnter(event: DragEvent<HTMLElement>) {
    if (!canDropBookFiles || !event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingBookFile(true);
  }

  function handleShelfDragOver(event: DragEvent<HTMLElement>) {
    if (!canDropBookFiles || !event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = isUploading ? 'none' : 'copy';
  }

  function handleShelfDragLeave(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingBookFile(false);
    }
  }

  function handleShelfDrop(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    resetDragState();
    if (!canDropBookFiles || isUploading) return;
    void onUploadFiles(event.dataTransfer.files);
  }

  return {
    isDraggingBookFile,
    handleShelfDragEnter,
    handleShelfDragOver,
    handleShelfDragLeave,
    handleShelfDrop,
  };
}
