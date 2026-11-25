import type { DragEvent } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useShelfFileDrop } from './useShelfFileDrop';

function createDragEvent(options: {
  types?: string[];
  files?: FileList;
} = {}) {
  const preventDefault = vi.fn();
  const dataTransfer = {
    types: options.types ?? ['Files'],
    files: options.files ?? ([] as unknown as FileList),
    dropEffect: 'none' as DataTransfer['dropEffect'],
  };
  return {
    preventDefault,
    dataTransfer,
  } as unknown as DragEvent<HTMLElement>;
}

describe('useShelfFileDrop', () => {
  it('starts inactive and tracks nested dragEnter/dragLeave depth accurately', () => {
    const onUploadFiles = vi.fn();
    const { result } = renderHook(() =>
      useShelfFileDrop({
        canDropBookFiles: true,
        isUploading: false,
        onUploadFiles,
      }),
    );

    expect(result.current.isDraggingBookFile).toBe(false);

    const enter1 = createDragEvent();
    act(() => result.current.handleShelfDragEnter(enter1));
    expect(enter1.preventDefault).toHaveBeenCalledTimes(1);
    expect(result.current.isDraggingBookFile).toBe(true);

    // Nested child enter increases depth to 2
    const enter2 = createDragEvent();
    act(() => result.current.handleShelfDragEnter(enter2));
    expect(result.current.isDraggingBookFile).toBe(true);

    // Leaving nested child decreases depth to 1 -> still dragging
    const leave1 = createDragEvent();
    act(() => result.current.handleShelfDragLeave(leave1));
    expect(leave1.preventDefault).toHaveBeenCalledTimes(1);
    expect(result.current.isDraggingBookFile).toBe(true);

    // Leaving container decreases depth to 0 -> dragging ends
    const leave2 = createDragEvent();
    act(() => result.current.handleShelfDragLeave(leave2));
    expect(result.current.isDraggingBookFile).toBe(false);

    // Extra leave clamps depth at 0 so the next single enter activates immediately
    const extraLeave = createDragEvent();
    act(() => result.current.handleShelfDragLeave(extraLeave));
    expect(result.current.isDraggingBookFile).toBe(false);

    act(() => result.current.handleShelfDragEnter(createDragEvent()));
    expect(result.current.isDraggingBookFile).toBe(true);
    act(() => result.current.handleShelfDragLeave(createDragEvent()));
    expect(result.current.isDraggingBookFile).toBe(false);
  });

  it('ignores non-file drags across all handlers', () => {
    const onUploadFiles = vi.fn();
    const { result } = renderHook(() =>
      useShelfFileDrop({
        canDropBookFiles: true,
        isUploading: false,
        onUploadFiles,
      }),
    );

    const textEnter = createDragEvent({ types: ['text/plain'] });
    const textOver = createDragEvent({ types: ['text/plain'] });
    const textLeave = createDragEvent({ types: ['text/plain'] });
    const textDrop = createDragEvent({ types: ['text/plain'] });

    act(() => {
      result.current.handleShelfDragEnter(textEnter);
      result.current.handleShelfDragOver(textOver);
      result.current.handleShelfDragLeave(textLeave);
      result.current.handleShelfDrop(textDrop);
    });

    expect(textEnter.preventDefault).not.toHaveBeenCalled();
    expect(textOver.preventDefault).not.toHaveBeenCalled();
    expect(textLeave.preventDefault).not.toHaveBeenCalled();
    expect(textDrop.preventDefault).not.toHaveBeenCalled();
    expect(result.current.isDraggingBookFile).toBe(false);
    expect(onUploadFiles).not.toHaveBeenCalled();
  });

  it('sets dropEffect based on uploading state and respects canDropBookFiles', () => {
    const onUploadFiles = vi.fn();
    const { result, rerender } = renderHook(
      (props: { canDropBookFiles: boolean; isUploading: boolean }) =>
        useShelfFileDrop({ ...props, onUploadFiles }),
      { initialProps: { canDropBookFiles: true, isUploading: false } },
    );

    const overIdle = createDragEvent();
    act(() => result.current.handleShelfDragOver(overIdle));
    expect(overIdle.preventDefault).toHaveBeenCalledTimes(1);
    expect(overIdle.dataTransfer.dropEffect).toBe('copy');

    rerender({ canDropBookFiles: true, isUploading: true });
    const overUploading = createDragEvent();
    act(() => result.current.handleShelfDragOver(overUploading));
    expect(overUploading.preventDefault).toHaveBeenCalledTimes(1);
    expect(overUploading.dataTransfer.dropEffect).toBe('none');

    rerender({ canDropBookFiles: false, isUploading: false });
    const enterDisabled = createDragEvent();
    const overDisabled = createDragEvent();
    act(() => {
      result.current.handleShelfDragEnter(enterDisabled);
      result.current.handleShelfDragOver(overDisabled);
    });
    expect(enterDisabled.preventDefault).not.toHaveBeenCalled();
    expect(overDisabled.preventDefault).not.toHaveBeenCalled();
    expect(result.current.isDraggingBookFile).toBe(false);
  });

  it('handles file drops, resets state, and suppresses uploads when disabled or already uploading', () => {
    const onUploadFiles = vi.fn();
    const file = new File(['epub'], 'book.epub', { type: 'application/epub+zip' });
    const files = [file] as unknown as FileList;

    const { result, rerender } = renderHook(
      (props: { canDropBookFiles: boolean; isUploading: boolean }) =>
        useShelfFileDrop({ ...props, onUploadFiles }),
      { initialProps: { canDropBookFiles: true, isUploading: false } },
    );

    act(() => {
      result.current.handleShelfDragEnter(createDragEvent());
      result.current.handleShelfDragEnter(createDragEvent());
    });
    expect(result.current.isDraggingBookFile).toBe(true);

    const dropEvent = createDragEvent({ files });
    act(() => result.current.handleShelfDrop(dropEvent));
    expect(dropEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(result.current.isDraggingBookFile).toBe(false);
    expect(onUploadFiles).toHaveBeenCalledWith(files);

    // While uploading: prevents default and resets state, but does not invoke onUploadFiles
    onUploadFiles.mockClear();
    rerender({ canDropBookFiles: true, isUploading: true });
    act(() => result.current.handleShelfDragEnter(createDragEvent()));
    expect(result.current.isDraggingBookFile).toBe(true);

    const uploadingDrop = createDragEvent({ files });
    act(() => result.current.handleShelfDrop(uploadingDrop));
    expect(uploadingDrop.preventDefault).toHaveBeenCalledTimes(1);
    expect(result.current.isDraggingBookFile).toBe(false);
    expect(onUploadFiles).not.toHaveBeenCalled();

    // When canDropBookFiles becomes false: still prevents default on Files drop, skips upload
    rerender({ canDropBookFiles: false, isUploading: false });
    const disabledDrop = createDragEvent({ files });
    act(() => result.current.handleShelfDrop(disabledDrop));
    expect(disabledDrop.preventDefault).toHaveBeenCalledTimes(1);
    expect(onUploadFiles).not.toHaveBeenCalled();
  });

  it('resets drag state on window dragend, drop, blur, and Escape, and cleans up listeners', () => {
    const onUploadFiles = vi.fn();
    const { result, unmount } = renderHook(() =>
      useShelfFileDrop({
        canDropBookFiles: true,
        isUploading: false,
        onUploadFiles,
      }),
    );

    const startDeepDrag = () => {
      act(() => {
        result.current.handleShelfDragEnter(createDragEvent());
        result.current.handleShelfDragEnter(createDragEvent());
      });
      expect(result.current.isDraggingBookFile).toBe(true);
    };

    for (const eventName of ['dragend', 'drop', 'blur'] as const) {
      startDeepDrag();
      act(() => {
        window.dispatchEvent(new Event(eventName));
      });
      expect(result.current.isDraggingBookFile).toBe(false);
    }

    startDeepDrag();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    });
    expect(result.current.isDraggingBookFile).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.isDraggingBookFile).toBe(false);

    // Verify depth was reset to 0 by global reset (one enter + one leave returns to false)
    act(() => result.current.handleShelfDragEnter(createDragEvent()));
    act(() => result.current.handleShelfDragLeave(createDragEvent()));
    expect(result.current.isDraggingBookFile).toBe(false);

    // Cleanup on unmount while dragging
    startDeepDrag();
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('dragend', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('drop', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('blur', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    removeSpy.mockRestore();
  });
});
