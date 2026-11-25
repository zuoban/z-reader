import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearFoliateSearch,
  MAX_BOOK_SEARCH_RESULTS,
  normalizeSearchExcerpt,
  searchFoliateView,
} from '../search';
import type {
  BookSearchResultItem,
  FoliateSearchYield,
  SearchableFoliateView,
} from '../types';
import { deferred } from '@/test/deferred';

function createSearchView(
  search: SearchableFoliateView['search'],
  overrides: Partial<SearchableFoliateView> = {},
): SearchableFoliateView {
  return {
    search,
    clearSearch: vi.fn(),
    book: {
      sections: [{ createDocument: () => document }],
    },
    ...overrides,
  } as unknown as SearchableFoliateView;
}

describe('normalizeSearchExcerpt', () => {
  it('preserves object excerpt fields and defaults missing/non-string values to empty strings', () => {
    expect(
      normalizeSearchExcerpt({ pre: 'before ', match: 'Target', post: ' after' }, 'target'),
    ).toEqual({ pre: 'before ', match: 'Target', post: ' after' });

    expect(
      normalizeSearchExcerpt(
        { pre: undefined, match: 'only', post: 123 as unknown as string },
        'fallback',
      ),
    ).toEqual({ pre: '', match: 'only', post: '' });
  });

  it('splits string excerpts case-insensitively on fallbackQuery preserving original case', () => {
    expect(normalizeSearchExcerpt('Hello World Again', 'world')).toEqual({
      pre: 'Hello ',
      match: 'World',
      post: ' Again',
    });

    expect(normalizeSearchExcerpt('No match here', 'absent')).toEqual({
      pre: 'No match here',
      match: '',
      post: '',
    });

    expect(normalizeSearchExcerpt('Plain excerpt', '')).toEqual({
      pre: 'Plain excerpt',
      match: '',
      post: '',
    });
  });

  it('falls back to fallbackQuery when excerpt is undefined', () => {
    expect(normalizeSearchExcerpt(undefined, 'query')).toEqual({
      pre: '',
      match: 'query',
      post: '',
    });
  });
});

describe('clearFoliateSearch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('safely no-ops when view or clearSearch is unavailable', () => {
    expect(() => clearFoliateSearch(null)).not.toThrow();
    expect(() => clearFoliateSearch({} as SearchableFoliateView)).not.toThrow();
  });

  it('invokes clearSearch and logs errors without throwing', () => {
    const clearSearch = vi.fn();
    clearFoliateSearch({ clearSearch } as unknown as SearchableFoliateView);
    expect(clearSearch).toHaveBeenCalledTimes(1);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failingView = {
      clearSearch: vi.fn(() => {
        throw new Error('clear boom');
      }),
    } as unknown as SearchableFoliateView;

    expect(() => clearFoliateSearch(failingView)).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to clear search highlights:',
      expect.any(Error),
    );
  });
});

describe('searchFoliateView', () => {
  it('returns unsupported when view, search, sections, or async iterable are missing', async () => {
    await expect(searchFoliateView(null, 'test')).resolves.toEqual({
      total: 0,
      supported: false,
      truncated: false,
    });

    await expect(searchFoliateView({} as SearchableFoliateView, 'test')).resolves.toEqual({
      total: 0,
      supported: false,
      truncated: false,
    });

    const noDocumentSectionsView = createSearchView(vi.fn(), {
      book: { sections: [{}, {}] } as SearchableFoliateView['book'],
    });
    await expect(searchFoliateView(noDocumentSectionsView, 'test')).resolves.toEqual({
      total: 0,
      supported: false,
      truncated: false,
    });

    const nonIterableView = createSearchView(
      vi.fn().mockReturnValue({ notIterable: true }) as unknown as SearchableFoliateView['search'],
    );
    await expect(searchFoliateView(nonIterableView, 'test')).resolves.toEqual({
      total: 0,
      supported: false,
      truncated: false,
    });
  });

  it('clears search and returns early for blank queries or pre-aborted signals', async () => {
    const searchMock = vi.fn();
    const clearSearch = vi.fn();
    const view = createSearchView(searchMock, { clearSearch });

    await expect(searchFoliateView(view, '   \t\n ')).resolves.toEqual({
      total: 0,
      supported: true,
      truncated: false,
    });
    expect(clearSearch).toHaveBeenCalledTimes(1);
    expect(searchMock).not.toHaveBeenCalled();

    const controller = new AbortController();
    controller.abort();
    await expect(searchFoliateView(view, 'hello', undefined, controller.signal)).resolves.toEqual({
      total: 0,
      supported: true,
      truncated: false,
    });
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('streams clamped progress, grouped subitems, flat matches, and stops at done', async () => {
    async function* generateResults(): AsyncGenerator<FoliateSearchYield> {
      yield { progress: -0.5 };
      yield { progress: 0.4 };
      yield { progress: 1.8 };
      yield { progress: Number.NaN };
      yield null as unknown as FoliateSearchYield;
      yield 'ignored-primitive' as unknown as FoliateSearchYield;
      yield {
        label: 'Chapter 1',
        subitems: [
          { cfi: '', excerpt: 'skipped' },
          { cfi: 'cfi-1', excerpt: { pre: 'a ', match: 'Star', post: ' b' } },
          { cfi: 'cfi-2', excerpt: 'A bright STAR shines' },
        ],
      };
      yield {
        subitems: [{ cfi: 'cfi-3', excerpt: undefined }],
      };
      yield { subitems: [] };
      yield { cfi: 'cfi-4', excerpt: 'Flat star match' };
      yield { cfi: '' };
      yield 'done';
      yield { cfi: 'cfi-after-done', excerpt: 'Should not be read' };
    }

    const searchMock = vi.fn().mockReturnValue(generateResults());
    // Also verify empty sections array is allowed
    const view = createSearchView(searchMock, {
      book: { sections: [] } as SearchableFoliateView['book'],
    });

    const progressValues: number[] = [];
    const batches: BookSearchResultItem[][] = [];

    const outcome = await searchFoliateView(view, '  star  ', {
      onProgress: (p) => progressValues.push(p),
      onResults: (items) => batches.push(items),
    });

    expect(searchMock).toHaveBeenCalledWith({ query: 'star' });
    expect(progressValues).toEqual([0, 0.4, 1, 0]);
    expect(batches).toEqual([
      [
        { cfi: 'cfi-1', excerpt: { pre: 'a ', match: 'Star', post: ' b' }, sectionLabel: 'Chapter 1' },
        { cfi: 'cfi-2', excerpt: { pre: 'A bright ', match: 'STAR', post: ' shines' }, sectionLabel: 'Chapter 1' },
      ],
      [
        { cfi: 'cfi-3', excerpt: { pre: '', match: 'star', post: '' }, sectionLabel: '' },
      ],
      [
        { cfi: 'cfi-4', excerpt: { pre: 'Flat ', match: 'star', post: ' match' }, sectionLabel: '' },
      ],
    ]);
    expect(outcome).toEqual({ total: 4, supported: true, truncated: false });
  });

  it('truncates when a batch exceeds MAX_BOOK_SEARCH_RESULTS and closes the iterator', async () => {
    const returnSpy = vi.fn().mockResolvedValue({ value: undefined, done: true });
    let emitted = 0;

    const iterable: AsyncIterable<FoliateSearchYield> = {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            emitted += 1;
            if (emitted === 1) {
              return {
                done: false,
                value: {
                  label: 'Big Chapter',
                  subitems: Array.from({ length: MAX_BOOK_SEARCH_RESULTS - 2 }, (_, i) => ({
                    cfi: `cfi-${i}`,
                    excerpt: 'match',
                  })),
                },
              };
            }
            if (emitted === 2) {
              return {
                done: false,
                value: {
                  label: 'Overflow Chapter',
                  subitems: Array.from({ length: 5 }, (_, i) => ({
                    cfi: `overflow-${i}`,
                    excerpt: 'match',
                  })),
                },
              };
            }
            return { done: true, value: undefined };
          },
          return: returnSpy,
        };
      },
    };

    const view = createSearchView(vi.fn().mockReturnValue(iterable));
    const received: BookSearchResultItem[] = [];

    const outcome = await searchFoliateView(view, 'match', {
      onResults: (items) => received.push(...items),
    });

    expect(outcome).toEqual({
      total: MAX_BOOK_SEARCH_RESULTS,
      supported: true,
      truncated: true,
    });
    expect(received).toHaveLength(MAX_BOOK_SEARCH_RESULTS);
    expect(received[received.length - 1]?.cfi).toBe('overflow-1');
    expect(returnSpy).toHaveBeenCalledTimes(1);
  });

  it('marks truncated only when extra items arrive after reaching MAX_BOOK_SEARCH_RESULTS', async () => {
    const makeExactIterable = (withExtra: boolean) => {
      const returnSpy = vi.fn().mockResolvedValue({ value: undefined, done: true });
      let step = 0;
      const iterable: AsyncIterable<FoliateSearchYield> = {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              step += 1;
              if (step === 1) {
                return {
                  done: false,
                  value: {
                    subitems: Array.from({ length: MAX_BOOK_SEARCH_RESULTS }, (_, i) => ({
                      cfi: `exact-${i}`,
                      excerpt: 'hit',
                    })),
                  },
                };
              }
              if (step === 2 && withExtra) {
                return { done: false, value: { cfi: 'extra-1', excerpt: 'hit' } };
              }
              return { done: true, value: undefined };
            },
            return: returnSpy,
          };
        },
      };
      return { iterable, returnSpy };
    };

    const exact = makeExactIterable(false);
    const exactOnResults = vi.fn();
    await expect(
      searchFoliateView(createSearchView(vi.fn().mockReturnValue(exact.iterable)), 'hit', {
        onResults: exactOnResults,
      }),
    ).resolves.toEqual({ total: MAX_BOOK_SEARCH_RESULTS, supported: true, truncated: false });
    expect(exactOnResults).toHaveBeenCalledTimes(1);
    expect(exact.returnSpy).not.toHaveBeenCalled();

    const overflow = makeExactIterable(true);
    const overflowOnResults = vi.fn();
    await expect(
      searchFoliateView(createSearchView(vi.fn().mockReturnValue(overflow.iterable)), 'hit', {
        onResults: overflowOnResults,
      }),
    ).resolves.toEqual({ total: MAX_BOOK_SEARCH_RESULTS, supported: true, truncated: true });
    expect(overflowOnResults).toHaveBeenCalledTimes(1);
    expect(overflow.returnSpy).toHaveBeenCalledTimes(1);
  });

  it('aborts in-flight search, closes iterator once, suppresses post-abort results, and tolerates return errors', async () => {
    const stepTwo = deferred<IteratorResult<FoliateSearchYield>>();
    let callCount = 0;
    const returnSpy = vi.fn(() => {
      throw new Error('return cleanup failed');
    });

    const iterable: AsyncIterable<FoliateSearchYield> = {
      [Symbol.asyncIterator]() {
        return {
          next() {
            callCount += 1;
            if (callCount === 1) {
              return Promise.resolve({
                done: false,
                value: { cfi: 'cfi-1', excerpt: 'first hit' },
              });
            }
            return stepTwo.promise;
          },
          return: returnSpy,
        };
      },
    };

    const controller = new AbortController();
    const onResults = vi.fn();
    const searchPromise = searchFoliateView(
      createSearchView(vi.fn().mockReturnValue(iterable)),
      'hit',
      { onResults },
      controller.signal,
    );

    await vi.waitFor(() => expect(onResults).toHaveBeenCalledTimes(1));

    controller.abort();
    expect(returnSpy).toHaveBeenCalledTimes(1);

    stepTwo.resolve({
      done: false,
      value: { cfi: 'cfi-late', excerpt: 'late hit' },
    });

    await expect(searchPromise).resolves.toEqual({
      total: 1,
      supported: true,
      truncated: false,
    });
    expect(onResults).toHaveBeenCalledTimes(1);
    expect(returnSpy).toHaveBeenCalledTimes(1);
  });

  it('stops before calling next() again when aborted synchronously inside onResults', async () => {
    const nextSpy = vi.fn<() => Promise<IteratorResult<FoliateSearchYield>>>()
      .mockResolvedValueOnce({
        done: false,
        value: { cfi: 'cfi-1', excerpt: 'hit' },
      })
      .mockResolvedValueOnce({
        done: false,
        value: { cfi: 'cfi-2', excerpt: 'hit' },
      });
    const returnSpy = vi.fn().mockResolvedValue({ done: true, value: undefined });

    const iterable: AsyncIterable<FoliateSearchYield> = {
      [Symbol.asyncIterator]() {
        return {
          next: nextSpy,
          return: returnSpy,
        };
      },
    };

    const controller = new AbortController();
    const outcome = await searchFoliateView(
      createSearchView(vi.fn().mockReturnValue(iterable)),
      'hit',
      {
        onResults: () => {
          controller.abort();
        },
      },
      controller.signal,
    );

    expect(outcome).toEqual({ total: 1, supported: true, truncated: false });
    expect(nextSpy).toHaveBeenCalledTimes(1);
    expect(returnSpy).toHaveBeenCalledTimes(1);
  });

  it('swallows iterator rejection after abort, but rethrows errors when not aborted', async () => {
    const pendingStep = deferred<IteratorResult<FoliateSearchYield>>();
    const abortedIterable: AsyncIterable<FoliateSearchYield> = {
      [Symbol.asyncIterator]() {
        return {
          next: () => pendingStep.promise,
        };
      },
    };
    const controller = new AbortController();
    const abortedSearch = searchFoliateView(
      createSearchView(vi.fn().mockReturnValue(abortedIterable)),
      'query',
      undefined,
      controller.signal,
    );
    controller.abort();
    pendingStep.reject(new Error('iterator aborted'));
    await expect(abortedSearch).resolves.toEqual({
      total: 0,
      supported: true,
      truncated: false,
    });

    const failingIterable: AsyncIterable<FoliateSearchYield> = {
      [Symbol.asyncIterator]() {
        return {
          next: () => Promise.reject(new Error('corrupt chapter')),
        };
      },
    };
    await expect(
      searchFoliateView(createSearchView(vi.fn().mockReturnValue(failingIterable)), 'query'),
    ).rejects.toThrow('corrupt chapter');
  });
});
