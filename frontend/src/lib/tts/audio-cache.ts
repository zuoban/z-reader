import type { TTSMark } from './types';

export class LRUCache<T> {
  private cache: Map<string, T> = new Map();
  private maxSize: number;

  constructor(maxSize = 10) {
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: T): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    this.cache.set(key, value);
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string, expected: T): void {
    if (this.cache.get(key) === expected) {
      this.cache.delete(key);
    }
  }

  clear(): void {
    this.cache.clear();
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
