export const SUPPORTED_FORMATS_ACCEPT = [
  '.epub',
  '.mobi',
  '.azw3',
  '.pdf',
  'application/epub+zip',
  'application/pdf',
  'application/x-mobipocket-ebook',
].join(',');

export const UNCATEGORIZED_FILTER_ID = 'uncategorized';

export type ShelfReadingStatus = 'all' | 'reading' | 'unread' | 'finished';

export const SUPPORTED_FORMAT_LABELS = ['EPUB', 'MOBI', 'AZW3', 'PDF'] as const;
