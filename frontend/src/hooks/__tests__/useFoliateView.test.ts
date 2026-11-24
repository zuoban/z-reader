import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { deferred } from '@/test/deferred';
import { useFoliateView } from '@/hooks/useFoliateView';
import { DEFAULT_READER_THEME } from '@/hooks/useReaderTheme';
import { api } from '@/lib/api';
import type { FoliateView } from '@/lib/types';

const open = vi.fn<(view: TestFoliateView, file: File) => Promise<void>>();
const close = vi.fn<(view: TestFoliateView) => void>();
const goTo = vi.fn<(view: TestFoliateView, location: string | number) => Promise<unknown>>();

class TestFoliateView extends HTMLElement {
  open(file: File) { return open(this, file); }
  close() { close(this); }
  goTo(location: string | number) { return goTo(this, location); }
  getBoundingClientRect() { return new DOMRect(0, 0, 600, 400); }
}
customElements.define('foliate-view', TestFoliateView);

function loadSection(view: TestFoliateView, index: number) {
  const doc = document.implementation.createHTMLDocument();
  view.dispatchEvent(new CustomEvent('load', { detail: { doc, index } }));
  return { index };
}

function renderReader(cfi?: string) {
  const container = document.createElement('div');
  const containerRef = { current: container };
  const viewRef = { current: null as FoliateView | null };
  const getStylesheet = () => '';
  const updateProgress = vi.fn();
  const bindReaderDocument = vi.fn();
  const progress = cfi ? { cfi, percentage: 10 } : null;
  const hook = renderHook(({ bookId }) => useFoliateView({
    bookId,
    containerRef,
    viewRef,
    isAuthenticated: true,
    progressLoading: false,
    progress,
    theme: DEFAULT_READER_THEME,
    getStylesheet,
    updateProgress,
    bindReaderDocument,
  }), { initialProps: { bookId: 'first' } });
  return { ...hook, container, viewRef, updateProgress, bindReaderDocument };
}

beforeEach(() => {
  open.mockReset().mockResolvedValue(undefined);
  close.mockReset();
  goTo.mockReset().mockImplementation(async (view, target) =>
    loadSection(view, typeof target === 'number' ? target : 1));
  vi.spyOn(api, 'createBookFile').mockImplementation(async (id) =>
    new File(['book'], `${id}.epub`));
});

afterEach(() => vi.restoreAllMocks());

it('releases a book that finishes opening after the reader switched books', async () => {
  const firstOpening = deferred<void>();
  open.mockReturnValueOnce(firstOpening.promise);
  const { rerender, result, container, updateProgress } = renderReader();
  await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
  const firstView = container.firstElementChild!;
  const firstDownloadSignal = vi.mocked(api.createBookFile).mock.calls[0][1]?.signal;

  rerender({ bookId: 'second' });
  await waitFor(() => expect(result.current.loading).toBe(false));
  const secondView = container.firstElementChild;
  expect(firstDownloadSignal?.aborted).toBe(true);
  expect(secondView).not.toBe(firstView);
  expect(goTo).toHaveBeenCalledExactlyOnceWith(secondView, 0);

  await act(async () => {
    firstView.dispatchEvent(new CustomEvent('relocate', { detail: { cfi: 'stale' } }));
    firstOpening.resolve();
  });
  expect(updateProgress).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledExactlyOnceWith(firstView);
  expect(goTo).toHaveBeenCalledTimes(1);
  expect(container.firstElementChild).toBe(secondView);
});

it('releases listeners when a chapter iframe is removed and the next chapter loads', async () => {
  const { result, viewRef, bindReaderDocument } = renderReader();
  await waitFor(() => expect(result.current.loading).toBe(false));
  const releaseChapter = vi.fn();
  bindReaderDocument.mockReturnValue(releaseChapter);
  const frame = document.createElement('iframe');
  document.body.append(frame);
  try {
    const view = viewRef.current as unknown as HTMLElement;
    act(() => {
      view.dispatchEvent(new CustomEvent('load', { detail: { doc: frame.contentDocument, index: 1 } }));
    });
    expect(releaseChapter).not.toHaveBeenCalled();
    frame.remove();
    act(() => { loadSection(view as TestFoliateView, 2); });
    expect(releaseChapter).toHaveBeenCalledTimes(1);
  } finally {
    frame.remove();
  }
});

it('ignores a late download failure after switching books', async () => {
  const firstDownload = deferred<File>();
  vi.mocked(api.createBookFile).mockReturnValueOnce(firstDownload.promise);
  const { rerender, result, viewRef } = renderReader();
  await waitFor(() => {
    expect(api.createBookFile).toHaveBeenCalledTimes(1);
    expect(viewRef.current).not.toBeNull();
  });

  rerender({ bookId: 'second' });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => firstDownload.reject(new Error('late download failure')));

  expect(result.current.error).toBeNull();
  expect(goTo).toHaveBeenCalledExactlyOnceWith(viewRef.current, 0);
  expect(close).toHaveBeenCalledTimes(1);
});

it('opens a valid saved position and binds its document without falling back', async () => {
  const cfi = 'epubcfi(/6/4!/4/2)';
  const { result, viewRef, bindReaderDocument } = renderReader(cfi);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBeNull();
  expect(goTo).toHaveBeenCalledExactlyOnceWith(viewRef.current, cfi);
  expect(bindReaderDocument).toHaveBeenCalledTimes(1);
});

it.each([undefined, { index: 999 }])(
  'waits for the first section when Foliate silently fails the saved CFI with %j',
  async (failedLocation) => {
    const firstSection = deferred<void>();
    goTo.mockResolvedValueOnce(failedLocation).mockImplementationOnce(async (view) => {
      await firstSection.promise;
      loadSection(view, 0);
    });
    const { result, viewRef } = renderReader('epubcfi(/6/999)');
    await waitFor(() => expect(goTo).toHaveBeenNthCalledWith(2, viewRef.current, 0));
    expect(result.current.loading).toBe(true);
    await act(async () => firstSection.resolve());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  },
);

it('reuses the first section when only its saved anchor failed', async () => {
  goTo.mockImplementationOnce(async (view) => {
    loadSection(view, 0);
    return undefined;
  }).mockResolvedValueOnce({ index: 0 });
  const { result, viewRef } = renderReader('epubcfi(/6/2!/4/999)');
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(goTo).toHaveBeenNthCalledWith(2, viewRef.current, 0);
  expect(result.current.error).toBeNull();
});

it('reports failure and closes the view if the first section never loads', async () => {
  goTo.mockResolvedValueOnce(undefined).mockImplementationOnce(async (view) => {
    view.dispatchEvent(new CustomEvent('load', { detail: { doc: null, index: 0 } }));
    return { index: 0 };
  });
  const { result, viewRef } = renderReader('epubcfi(/6/999)');
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toMatch(/无法加载书籍的首个章节/);
  expect(viewRef.current).toBeNull();
  expect(close).toHaveBeenCalledTimes(1);
});
