export type ReaderFontPackId = 'editorial' | 'classic' | 'humanist';

type FontPackLoader = () => Promise<unknown>;

const DEFAULT_PACK_LOADERS: Partial<Record<ReaderFontPackId, FontPackLoader>> = {
  editorial: () => import('./reader-fonts-editorial'),
  classic: () => import('./reader-fonts-classic'),
};

let packLoaders: Partial<Record<ReaderFontPackId, FontPackLoader>> = {
  ...DEFAULT_PACK_LOADERS,
};

const loadedPacks = new Set<ReaderFontPackId>();
const pendingPacks = new Map<ReaderFontPackId, Promise<void>>();
const listeners = new Set<() => void>();
let packVersion = 0;

function notifyListeners() {
  packVersion += 1;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeReaderFontPacks(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getReaderFontPacksVersion(): number {
  return packVersion;
}

export function getServerReaderFontPacksVersion(): number {
  return 0;
}

export function ensureReaderFontPack(fontFamily: ReaderFontPackId): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }
  const loader = packLoaders[fontFamily];
  if (!loader || loadedPacks.has(fontFamily)) {
    return Promise.resolve();
  }
  const existing = pendingPacks.get(fontFamily);
  if (existing) {
    return existing;
  }

  const task = loader()
    .then(() => {
      loadedPacks.add(fontFamily);
      pendingPacks.delete(fontFamily);
      notifyListeners();
    })
    .catch(() => {
      pendingPacks.delete(fontFamily);
    });

  pendingPacks.set(fontFamily, task);
  return task;
}

export function resetReaderFontPacksForTest(
  overrides?: Partial<Record<ReaderFontPackId, FontPackLoader>>,
) {
  loadedPacks.clear();
  pendingPacks.clear();
  listeners.clear();
  packVersion = 0;
  packLoaders = overrides ? { ...DEFAULT_PACK_LOADERS, ...overrides } : { ...DEFAULT_PACK_LOADERS };
}
