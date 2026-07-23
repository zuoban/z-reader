import { describe, expect, it } from 'vitest';
import {
  getShelfColumnCount,
  getShelfGapPx,
  getShelfRowCount,
} from '@/lib/shelf-grid';

describe('shelf-grid', () => {
  it('uses 2 columns on mobile widths', () => {
    expect(getShelfColumnCount(320)).toBe(2);
    expect(getShelfColumnCount(639)).toBe(2);
  });

  it('fits more columns as width grows past sm/lg', () => {
    expect(getShelfColumnCount(640)).toBeGreaterThanOrEqual(2);
    expect(getShelfColumnCount(800)).toBeGreaterThanOrEqual(3);
    expect(getShelfColumnCount(1280)).toBeGreaterThanOrEqual(5);
  });

  it('computes row counts from items and columns', () => {
    expect(getShelfRowCount(0, 3)).toBe(0);
    expect(getShelfRowCount(1, 3)).toBe(1);
    expect(getShelfRowCount(3, 3)).toBe(1);
    expect(getShelfRowCount(4, 3)).toBe(2);
    expect(getShelfRowCount(10, 4)).toBe(3);
  });

  it('uses tighter gap on mobile', () => {
    expect(getShelfGapPx(375)).toBe(12);
    expect(getShelfGapPx(768)).toBe(16);
  });
});
