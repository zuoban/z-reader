import type { ReaderTheme } from "@/hooks/useReaderTheme";
import type { FoliateView, TOCItem } from "@/lib/types";
import { pruneDisconnectedChapterCleanups } from "./bookLoader";
import { bindImageZoomDocument } from "./imageZoom";
import { applyDarkInlineOverrides, formatPageLabel } from "./rendererStyles";
import { normalizeMetadataText } from "./runtime";
import type { FoliateZoomImage } from "./types";

export function mountFoliateView(container: HTMLDivElement): FoliateView {
  const view = document.createElement("foliate-view") as unknown as FoliateView;
  view.style.height = "100%";
  view.style.width = "100%";
  view.style.display = "block";
  container.replaceChildren();
  container.appendChild(view as unknown as Node);
  return view;
}

export interface BindFoliateViewEventsOptions {
  view: FoliateView;
  signal: AbortSignal;
  isCancelled: () => boolean;
  isCurrentView: () => boolean;
  getLoadedSections: () => Set<number> | null;
  chapterCleanups: Map<Document, () => void>;
  bindReaderDocument: (doc: Document, view?: FoliateView) => void | (() => void);
  getOnImageOpen: () => ((image: FoliateZoomImage) => void) | undefined;
  getThemePreset: () => ReaderTheme["preset"];
  getFallbackMetadata: () => { title: string; author: string };
  onMetadata: (metadata: { toc: TOCItem[]; title: string; author: string }) => void;
  onInlinePresetApplied: (preset: ReaderTheme["preset"]) => void;
  onRelocate: (update: {
    percentage: number;
    cfi?: string;
    chapter?: string;
    chapterHref?: string;
    pageLabel: string;
  }) => void;
}

export function bindFoliateViewEvents({
  view,
  signal,
  isCancelled,
  isCurrentView,
  getLoadedSections,
  chapterCleanups,
  bindReaderDocument,
  getOnImageOpen,
  getThemePreset,
  getFallbackMetadata,
  onMetadata,
  onInlinePresetApplied,
  onRelocate,
}: BindFoliateViewEventsOptions): void {
  const handleLoad = (e: CustomEvent) => {
    if (isCancelled() || !isCurrentView()) return;
    const { doc, index } = e.detail ?? {};
    if (!doc?.documentElement || !Number.isInteger(index) || index < 0) return;
    getLoadedSections()?.add(index);
    try {
      const book = view.book;
      const fallback = getFallbackMetadata();
      onMetadata({
        toc: book?.toc || [],
        title: normalizeMetadataText(book?.metadata?.title) || fallback.title,
        author: normalizeMetadataText(book?.metadata?.author) || fallback.author,
      });
      pruneDisconnectedChapterCleanups(chapterCleanups);
      if (!chapterCleanups.has(doc)) {
        const unbindControls = bindReaderDocument(doc, view);
        const unbindImageZoom = bindImageZoomDocument(doc, getOnImageOpen);
        chapterCleanups.set(doc, () => {
          unbindControls?.();
          unbindImageZoom?.();
        });
      }
      const preset = getThemePreset();
      applyDarkInlineOverrides(doc, preset);
      onInlinePresetApplied(preset);
    } catch (err) {
      console.error("Failed to handle book load event:", err);
    }
  };

  const handleRelocate = (e: CustomEvent) => {
    if (isCancelled() || !isCurrentView()) return;
    try {
      const { cfi, fraction, tocItem, pageItem, location } = e.detail;
      const percentage = Number(((fraction || 0) * 100).toFixed(2));
      onRelocate({
        percentage,
        cfi: cfi || undefined,
        chapter: tocItem?.label || undefined,
        chapterHref: tocItem?.label ? tocItem.href || "" : undefined,
        pageLabel: formatPageLabel(view.renderer, pageItem, location),
      });
    } catch (err) {
      console.error("Failed to handle relocate event:", err);
    }
  };

  view.addEventListener?.("load", handleLoad);
  view.addEventListener?.("relocate", handleRelocate);
  signal.addEventListener(
    "abort",
    () => {
      view.removeEventListener?.("load", handleLoad);
      view.removeEventListener?.("relocate", handleRelocate);
    },
    { once: true },
  );
}
