import { describe, expect, it } from 'vitest';
import {
  BOOKMARK_EXCERPT_MAX_LENGTH,
  clamp,
  formatDownloadBytes,
  formatOfflineDownloadLabel,
  getZoomedState,
  normalizeBookmarkExcerpt,
} from '@/lib/reader-page';

describe('reader-page helpers', () => {
  it('clamps values into range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });

  it('formats download sizes', () => {
    expect(formatDownloadBytes(512)).toBe('1 KB');
    expect(formatDownloadBytes(2048)).toBe('2 KB');
    expect(formatDownloadBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('formats offline download labels', () => {
    expect(formatOfflineDownloadLabel(null)).toBeUndefined();
    expect(
      formatOfflineDownloadLabel({
        downloadedBytes: 1024,
        totalBytes: 2048,
        percentage: 50,
        bytesPerSecond: 0,
        resumed: false,
      })
    ).toBe('保存 50%');
    expect(
      formatOfflineDownloadLabel({
        downloadedBytes: 2048,
        totalBytes: null,
        percentage: null,
        bytesPerSecond: 0,
        resumed: false,
      })
    ).toBe('保存 2 KB');
  });

  it('normalizes bookmark excerpts and trims long text', () => {
    expect(normalizeBookmarkExcerpt('  hello   world  ')).toBe('hello world');
    const long = '字'.repeat(BOOKMARK_EXCERPT_MAX_LENGTH + 10);
    const excerpt = normalizeBookmarkExcerpt(long);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt.length).toBe(BOOKMARK_EXCERPT_MAX_LENGTH + 1);
  });

  it('scales zoom around the focus point', () => {
    // jsdom: window.innerWidth/Height default 1024x768 → center 512,384
    const next = getZoomedState({ scale: 1, x: 0, y: 0 }, 2, 512, 384);
    expect(next.scale).toBe(2);
    expect(next.x).toBe(0);
    expect(next.y).toBe(0);
  });
});
