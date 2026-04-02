declare module '/foliate/view.js' {
  export function makeBook(file: File | Blob | string): Promise<{
    metadata?: unknown;
    getCover?: () => Promise<Blob | null> | Blob | null;
    destroy?: () => void;
  }>;
}
