import type { TTSMark } from './types';

export class LRUCache<T> {
  private cache: Map<string, { data: T; release?: () => void }> = new Map();
  private maxSize: number;

  constructor(maxSize = 10) {
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      this.cache.delete(key);
      this.cache.set(key, entry);
      return entry.data;
    }
    return undefined;
  }

  set(key: string, value: T, release?: () => void): void {
    if (this.cache.has(key)) {
      const oldEntry = this.cache.get(key);
      oldEntry?.release?.();
      this.cache.delete(key);
    }
    this.cache.set(key, { data: value, release });
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        const entry = this.cache.get(firstKey);
        entry?.release?.();
        this.cache.delete(firstKey);
      }
    }
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string, expected: T): void {
    const entry = this.cache.get(key);
    if (!entry || entry.data !== expected) return;
    entry.release?.();
    this.cache.delete(key);
  }

  clear(): void {
    for (const entry of this.cache.values()) {
      entry?.release?.();
    }
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

export function computeMarkBoundaries(marks: TTSMark[]): number[] {
  const totalWeight = marks.reduce(
    (sum, mark) => sum + Math.max(0.001, mark.weight ?? mark.text.length),
    0,
  );
  let cumulative = 0;
  return marks.map((mark) => {
    cumulative += Math.max(0.001, mark.weight ?? mark.text.length);
    return cumulative / totalWeight;
  });
}

export function findMarkIndexAtProgress(
  boundaries: number[],
  markCount: number,
  progress: number,
): number {
  let low = 0;
  let high = markCount - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (progress < boundaries[middle]) high = middle;
    else low = middle + 1;
  }
  return low;
}
