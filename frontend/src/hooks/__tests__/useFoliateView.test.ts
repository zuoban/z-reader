import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { deferred } from '@/test/deferred';
import {
  MAX_BOOK_SEARCH_RESULTS,
  useFoliateView,
  type BookSearchResultItem,
} from '@/hooks/useFoliateView';
import type { SearchableFoliateView } from '@/hooks/foliate/types';
import { DEFAULT_READER_THEME } from '@/hooks/useReaderTheme';
import { api } from '@/lib/api';
import type { FoliateView } from '@/lib/types';

const open = vi.fn<(view: TestFoliateView, file: File) => Promise<void>>();
const close = vi.fn<(view: TestFoliateView) => void>();
const goTo = vi.fn<(view: TestFoliateView, location: string | number) => Promise<unknown>>();
const setStyles = vi.fn<(css: string) => void>();
const setRendererAttribute = vi.fn<(name: string, value: string) => void>();
const removeRendererAttribute = vi.fn<(name: string) => void>();

class TestFoliateView extends HTMLElement {
  renderer = {
    setStyles: (css: string) => setStyles(css),
    setAttribute: (name: string, value: string) => setRendererAttribute(name, value),
    removeAttribute: (name: string) => removeRendererAttribute(name),
    getContents: () => [],
  };
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
  const getStylesheet = vi.fn((fontSize = DEFAULT_READER_THEME.fontSize) => `body { font-size: ${fontSize}px; }`);
  const updateProgress = vi.fn();
  const bindReaderDocument = vi.fn();
  const progress = cfi ? { cfi, percentage: 10 } : null;
  const hook = renderHook(({ bookId, theme }) => useFoliateView({
    bookId,
    containerRef,
    viewRef,
    isAuthenticated: true,
    progressLoading: false,
    progress,
    theme,
    getStylesheet: () => getStylesheet(theme.fontSize),
    updateProgress,
    bindReaderDocument,
  }), { initialProps: { bookId: 'first', theme: DEFAULT_READER_THEME } });
  return { ...hook, container, viewRef, updateProgress, bindReaderDocument, getStylesheet };
}

beforeEach(() => {
  open.mockReset().mockResolvedValue(undefined);
  close.mockReset();
  goTo.mockReset().mockImplementation(async (view, target) =>
    loadSection(view, typeof target === 'number' ? target : 1));
  setStyles.mockReset();
  setRendererAttribute.mockReset();
  removeRendererAttribute.mockReset();
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

  rerender({ bookId: 'second', theme: DEFAULT_READER_THEME });
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

  rerender({ bookId: 'second', theme: DEFAULT_READER_THEME });
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

it('applies initial stylesheet once on open and reapplies only when stylesheet changes', async () => {
  const { result, rerender } = renderReader();
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(setStyles).toHaveBeenCalledTimes(1);
  expect(setStyles).toHaveBeenCalledWith(`body { font-size: ${DEFAULT_READER_THEME.fontSize}px; }`);
  const initialAttrCalls = setRendererAttribute.mock.calls.length;

  rerender({
    bookId: 'first',
    theme: { ...DEFAULT_READER_THEME, fontSize: DEFAULT_READER_THEME.fontSize + 2 },
  });

  expect(setStyles).toHaveBeenCalledTimes(2);
  expect(setStyles).toHaveBeenLastCalledWith(`body { font-size: ${DEFAULT_READER_THEME.fontSize + 2}px; }`);
  expect(setRendererAttribute.mock.calls.length).toBe(initialAttrCalls);
});

it('returns unsupported when view search is missing or sections lack createDocument', async () => {
  const { result, viewRef } = renderReader();
  await waitFor(() => expect(result.current.loading).toBe(false));

  const missingResult = await result.current.searchBook('test');
  expect(missingResult).toEqual({ total: 0, supported: false, truncated: false });

  const searchableView = viewRef.current as SearchableFoliateView;
  searchableView.search = async function* () {
    yield 'done';
  };
  searchableView.book = { sections: [{}] };
  const noTextSectionsResult = await result.current.searchBook('test');
  expect(noTextSectionsResult).toEqual({ total: 0, supported: false, truncated: false });
});

it('streams progress, section subitems, single items, and clears search cleanly', async () => {
  const { result, viewRef } = renderReader();
  await waitFor(() => expect(result.current.loading).toBe(false));

  const clearSearchMock = vi.fn();
  const searchableView = viewRef.current as SearchableFoliateView;
  searchableView.clearSearch = clearSearchMock;
  searchableView.search = async function* () {
    yield { progress: 0.5 };
    yield {
      label: '第一章',
      subitems: [
        {
          cfi: 'epubcfi(/6/2!/4/2)',
          excerpt: { pre: '前文', match: '关键词', post: '后文' },
        },
        {
          cfi: 'epubcfi(/6/2!/4/4)',
          excerpt: '字符串摘录里的关键词片段',
        },
      ],
    };
    yield {
      cfi: 'epubcfi(/6/4!/4/6)',
      excerpt: { pre: '单条', match: '关键词', post: '结尾' },
    };
    yield { progress: 1 };
    yield 'done';
  };

  // Blank query clears search without running iterator
  const blankOutcome = await result.current.searchBook('   ');
  expect(blankOutcome).toEqual({ total: 0, supported: true, truncated: false });
  expect(clearSearchMock).toHaveBeenCalledTimes(1);

  const progressValues: number[] = [];
  const collected: BookSearchResultItem[] = [];
  const outcome = await result.current.searchBook(' 关键词 ', {
    onProgress: (p) => progressValues.push(p),
    onResults: (items) => collected.push(...items),
  });

  expect(outcome).toEqual({ total: 3, supported: true, truncated: false });
  expect(progressValues).toEqual([0.5, 1]);
  expect(collected).toEqual([
    {
      cfi: 'epubcfi(/6/2!/4/2)',
      sectionLabel: '第一章',
      excerpt: { pre: '前文', match: '关键词', post: '后文' },
    },
    {
      cfi: 'epubcfi(/6/2!/4/4)',
      sectionLabel: '第一章',
      excerpt: { pre: '字符串摘录里的', match: '关键词', post: '片段' },
    },
    {
      cfi: 'epubcfi(/6/4!/4/6)',
      sectionLabel: '',
      excerpt: { pre: '单条', match: '关键词', post: '结尾' },
    },
  ]);

  result.current.clearSearch();
  expect(clearSearchMock).toHaveBeenCalledTimes(2);
});

it('aborts in-flight search and truncates results at MAX_BOOK_SEARCH_RESULTS', async () => {
  const { result, viewRef } = renderReader();
  await waitFor(() => expect(result.current.loading).toBe(false));

  const searchableView = viewRef.current as SearchableFoliateView;
  const gate = deferred<void>();
  let generatorReturned = false;

  searchableView.search = async function* () {
    try {
      yield {
        label: '第一章',
        subitems: [{ cfi: 'cfi-1', excerpt: { pre: '', match: 'a', post: '' } }],
      };
      await gate.promise;
      yield {
        label: '第二章',
        subitems: [{ cfi: 'cfi-2', excerpt: { pre: '', match: 'a', post: '' } }],
      };
    } finally {
      generatorReturned = true;
    }
  };

  const controller = new AbortController();
  const collected: BookSearchResultItem[] = [];
  const searchPromise = result.current.searchBook(
    'a',
    {
      onResults: (items) => {
        collected.push(...items);
        controller.abort();
        gate.resolve();
      },
    },
    controller.signal,
  );

  const abortedOutcome = await searchPromise;
  expect(abortedOutcome).toEqual({ total: 1, supported: true, truncated: false });
  expect(collected.map((item) => item.cfi)).toEqual(['cfi-1']);
  expect(generatorReturned).toBe(true);

  // Truncation at MAX_BOOK_SEARCH_RESULTS
  searchableView.search = async function* () {
    yield {
      label: '大章节',
      subitems: Array.from({ length: MAX_BOOK_SEARCH_RESULTS + 20 }, (_, i) => ({
        cfi: `cfi-${i}`,
        excerpt: { pre: '', match: 'x', post: '' },
      })),
    };
  };

  const truncatedCollected: BookSearchResultItem[] = [];
  const truncatedOutcome = await result.current.searchBook('x', {
    onResults: (items) => truncatedCollected.push(...items),
  });
  expect(truncatedOutcome).toEqual({
    total: MAX_BOOK_SEARCH_RESULTS,
    supported: true,
    truncated: true,
  });
  expect(truncatedCollected).toHaveLength(MAX_BOOK_SEARCH_RESULTS);
});

it('handles rejected goTo promises gracefully when applying remote progress updates', async () => {
  const container = document.createElement('div');
  const containerRef = { current: container };
  const viewRef = { current: null as FoliateView | null };
  const getStylesheet = vi.fn(() => 'body {}');
  const updateProgress = vi.fn();
  const bindReaderDocument = vi.fn();

  const { result, rerender } = renderHook(
    ({ progress }) =>
      useFoliateView({
        bookId: 'remote-sync',
        containerRef,
        viewRef,
        isAuthenticated: true,
        progressLoading: false,
        progress,
        theme: DEFAULT_READER_THEME,
        getStylesheet,
        updateProgress,
        bindReaderDocument,
      }),
    {
      initialProps: {
        progress: {
          cfi: 'epubcfi(/6/2!/4/2)',
          percentage: 10,
          updated_at: '2026-05-01T00:00:00Z',
          remote: false,
        },
      },
    },
  );

  await waitFor(() => expect(result.current.loading).toBe(false));

  goTo.mockRejectedValueOnce(new Error('invalid remote cfi'));

  rerender({
    progress: {
      cfi: 'epubcfi(/6/99!/4/2)',
      percentage: 80,
      updated_at: '2026-05-01T01:00:00Z',
      remote: true,
    },
  });

  await waitFor(() => {
    expect(goTo).toHaveBeenLastCalledWith(viewRef.current, 'epubcfi(/6/99!/4/2)');
  });
  // Flush microtasks so an unhandled rejection would fail the test.
  await Promise.resolve();
  await Promise.resolve();
});
