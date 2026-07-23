import type { FoliateView } from '@/lib/types';
import type { BookDownloadProgress } from '@/lib/api';

export const READER_MIN_IMAGE_SCALE = 1;
export const READER_MAX_IMAGE_SCALE = 5;
export const BOOKMARK_EXCERPT_MAX_LENGTH = 72;

export interface ReaderImageZoomState {
  scale: number;
  x: number;
  y: number;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function formatDownloadBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function formatOfflineDownloadLabel(
  progress: BookDownloadProgress | null
): string | undefined {
  if (!progress) return undefined;
  if (progress.percentage !== null) return `保存 ${Math.floor(progress.percentage)}%`;
  return `保存 ${formatDownloadBytes(progress.downloadedBytes)}`;
}

export function normalizeBookmarkExcerpt(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= BOOKMARK_EXCERPT_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, BOOKMARK_EXCERPT_MAX_LENGTH)}…`;
}

function getElementFromRange(range: Range) {
  const node = range.startContainer;
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement;
}

/** Best-effort excerpt for the current reading location. */
export function getBookmarkExcerpt(view: FoliateView | null) {
  const range = view?.lastLocation?.range;
  const rangeText = range ? normalizeBookmarkExcerpt(range.toString()) : '';
  if (rangeText) return rangeText;

  const startElement = range ? getElementFromRange(range) : null;
  const block = startElement?.closest(
    'p, li, blockquote, dd, dt, h1, h2, h3, h4, h5, h6'
  );
  const blockText = block?.textContent
    ? normalizeBookmarkExcerpt(block.textContent)
    : '';
  if (blockText) return blockText;

  const doc =
    range?.startContainer.ownerDocument ??
    view?.renderer?.getContents?.()[0]?.doc ??
    view?.tts?.doc;

  return normalizeBookmarkExcerpt(doc?.body?.textContent ?? '');
}

export function getZoomedState(
  state: ReaderImageZoomState,
  nextScale: number,
  clientX: number,
  clientY: number
): ReaderImageZoomState {
  const scale = clamp(nextScale, READER_MIN_IMAGE_SCALE, READER_MAX_IMAGE_SCALE);
  const viewportCenterX = window.innerWidth / 2;
  const viewportCenterY = window.innerHeight / 2;
  const focusX = clientX - viewportCenterX;
  const focusY = clientY - viewportCenterY;
  const ratio = scale / state.scale;

  return {
    scale,
    x: focusX - (focusX - state.x) * ratio,
    y: focusY - (focusY - state.y) * ratio,
  };
}
