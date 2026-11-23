import { describe, expect, it } from 'vitest';
import {
  formatRemainingTime,
  getTTSSessionKey,
  normalizeMetadataText,
} from '@/lib/tts-helpers';

describe('tts-helpers', () => {
  it('builds session storage keys per book', () => {
    expect(getTTSSessionKey()).toBeNull();
    expect(getTTSSessionKey('book-1')).toBe('z-reader-tts-session:book-1');
  });

  it('formats remaining time labels', () => {
    expect(formatRemainingTime(0)).toBe('即将结束');
    expect(formatRemainingTime(12)).toBe('剩余 12 秒');
    expect(formatRemainingTime(90)).toBe('剩余 1 分 30 秒');
    expect(formatRemainingTime(120)).toBe('剩余 2 分');
  });

  it('normalizes nested metadata text', () => {
    expect(normalizeMetadataText('  Title  ')).toBe('Title');
    expect(normalizeMetadataText(['A', 'B'])).toBe('A / B');
    expect(normalizeMetadataText({ name: 'Author' })).toBe('Author');
  });
});
