import type { FoliateView } from '@/lib/types';
import type { BookDownloadProgress } from '@/lib/api';

export const READER_MIN_IMAGE_SCALE = 1;
export const READER_MAX_IMAGE_SCALE = 5;
export const READER_IMAGE_ZOOM_STEPS = [1, 1.5, 2, 3, 4, 5] as const;
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

export function getNextImageZoomScale(
  currentScale: number,
  direction: -1 | 1
): number {
  const epsilon = 0.04;
  if (direction > 0) {
    const next = READER_IMAGE_ZOOM_STEPS.find((step) => step > currentScale + epsilon);
    return next ?? READER_MAX_IMAGE_SCALE;
  }

  for (let index = READER_IMAGE_ZOOM_STEPS.length - 1; index >= 0; index -= 1) {
    const step = READER_IMAGE_ZOOM_STEPS[index];
    if (step < currentScale - epsilon) {
      return step;
    }
  }
  return READER_MIN_IMAGE_SCALE;
}

export function getZoomedState(
  state: ReaderImageZoomState,
  nextScale: number,
  clientX: number,
  clientY: number
): ReaderImageZoomState {
  const scale = clamp(nextScale, READER_MIN_IMAGE_SCALE, READER_MAX_IMAGE_SCALE);
  if (scale <= READER_MIN_IMAGE_SCALE + 0.001) {
    return { scale: READER_MIN_IMAGE_SCALE, x: 0, y: 0 };
  }

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
