export interface BookPreview {
  title?: string;
  author?: string;
  cover?: Blob | null;
}

declare global {
  interface Window {
    foliateMakeBook?: (file: File | Blob | string) => Promise<{
      metadata?: unknown;
      getCover?: () => Promise<Blob | null> | Blob | null;
      destroy?: () => void;
    }>;
  }
}

function normalizeTextValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(normalizeTextValue).filter(Boolean).join(', ');
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return normalizeTextValue(record.name ?? record.title ?? record.label);
  }
  return '';
}

let foliateLoadPromise: Promise<void> | null = null;

async function ensureFoliateLoaded(): Promise<void> {
  if (globalThis.window?.foliateMakeBook) return;
  if (!foliateLoadPromise) {
    foliateLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/foliate/view.js';
      script.type = 'module';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load foliate.js'));
      document.head.appendChild(script);
    });
  }
  await foliateLoadPromise;
}

export async function extractBookPreview(file: File): Promise<BookPreview> {
  await ensureFoliateLoaded();
  const makeBook = globalThis.window?.foliateMakeBook;
  if (!makeBook) {
    throw new Error('foliate.js not available');
  }
  const book = await makeBook(file);

  const metadata = (book?.metadata ?? {}) as Record<string, unknown>;
  const title = normalizeTextValue(metadata.title) || file.name.replace(/\.[^.]+$/, '');
  const author = normalizeTextValue(metadata.author);
  const cover = await book?.getCover?.();

  book?.destroy?.();

  return {
    title,
    author,
    cover: cover instanceof Blob ? cover : null,
  };
}
