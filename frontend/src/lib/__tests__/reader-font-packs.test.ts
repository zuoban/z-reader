import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ensureReaderFontPack,
  getReaderFontPacksVersion,
  resetReaderFontPacksForTest,
  subscribeReaderFontPacks,
} from '@/lib/reader-font-packs';

describe('reader-font-packs', () => {
  afterEach(() => {
    resetReaderFontPacksForTest();
  });

  it('deduplicates concurrent loads and notifies subscribers once loaded', async () => {
    let resolveLoad!: () => void;
    const loadClassic = vi.fn(
      () => new Promise<void>((resolve) => {
        resolveLoad = resolve;
      }),
    );
    resetReaderFontPacksForTest({ classic: loadClassic });

    const listener = vi.fn();
    const unsubscribe = subscribeReaderFontPacks(listener);

    const first = ensureReaderFontPack('classic');
    const second = ensureReaderFontPack('classic');
    expect(loadClassic).toHaveBeenCalledTimes(1);
    expect(getReaderFontPacksVersion()).toBe(0);

    resolveLoad();
    await Promise.all([first, second]);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getReaderFontPacksVersion()).toBe(1);

    await ensureReaderFontPack('classic');
    expect(loadClassic).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('clears failed loads so subsequent calls can retry', async () => {
    const loadEditorial = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(undefined);
    resetReaderFontPacksForTest({ editorial: loadEditorial });

    await ensureReaderFontPack('editorial');
    expect(getReaderFontPacksVersion()).toBe(0);

    await ensureReaderFontPack('editorial');
    expect(loadEditorial).toHaveBeenCalledTimes(2);
    expect(getReaderFontPacksVersion()).toBe(1);
  });

  it('is a no-op for humanist system fonts', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeReaderFontPacks(listener);

    await ensureReaderFontPack('humanist');
    expect(listener).not.toHaveBeenCalled();
    expect(getReaderFontPacksVersion()).toBe(0);
    unsubscribe();
  });
});
