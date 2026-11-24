export const PERSONAL_LIBRARY = 'personal';
export const ACCESS_GENERATION_KEY = 'z-reader-library-access-generation';

let inMemoryGeneration: string | null = null;
let generationWriteFailed = false;

export function getAccessGeneration(): string | null {
  if (typeof window === 'undefined') return null;
  if (!generationWriteFailed) {
    try {
      inMemoryGeneration = localStorage.getItem(ACCESS_GENERATION_KEY);
    } catch {
      // Use the last known access generation while storage is blocked.
    }
  }
  return inMemoryGeneration;
}

export function setAccessGeneration(generation: string): void {
  inMemoryGeneration = generation;
  try {
    localStorage.setItem(ACCESS_GENERATION_KEY, generation);
    generationWriteFailed = false;
  } catch {
    generationWriteFailed = true;
  }
}

export function getOfflineLibrary(generation = getAccessGeneration()): string {
  return generation === null ? PERSONAL_LIBRARY : `${PERSONAL_LIBRARY}:${generation}`;
}

export function accessStorageKey(key: string, generation: string | null): string {
  return generation === null ? key : `z-reader-access:${generation}:${key}`;
}
