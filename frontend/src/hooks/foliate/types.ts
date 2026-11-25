import type { RefObject } from "react";
import type { ReaderTheme } from "@/hooks/useReaderTheme";
import type { FoliateView } from "@/lib/types";

export interface FoliateProgress {
  cfi: string;
  percentage: number;
  updated_at?: string;
  remote?: boolean;
}

export interface FoliateZoomImage {
  src: string;
  alt: string;
}

export interface BookSearchExcerpt {
  pre: string;
  match: string;
  post: string;
}

export interface BookSearchResultItem {
  cfi: string;
  excerpt: BookSearchExcerpt;
  sectionLabel: string;
}

export interface BookSearchCallbacks {
  onProgress?: (progress: number) => void;
  onResults?: (items: BookSearchResultItem[]) => void;
}

export interface BookSearchOutcome {
  total: number;
  supported: boolean;
  truncated: boolean;
}

export interface FoliateRawSearchExcerpt {
  pre?: string;
  match?: string;
  post?: string;
}

export interface FoliateRawSearchMatch {
  cfi?: string;
  excerpt?: string | FoliateRawSearchExcerpt;
}

export type FoliateSearchYield =
  | "done"
  | { progress: number }
  | { label?: string; subitems: FoliateRawSearchMatch[] }
  | FoliateRawSearchMatch;

export type SearchableFoliateView = FoliateView & {
  book?: FoliateView["book"] & {
    sections?: Array<{
      createDocument?: () => Promise<Document> | Document;
    }>;
  };
  search?: (opts: { query: string }) => AsyncIterable<FoliateSearchYield>;
  clearSearch?: () => void;
};

export interface UseFoliateViewOptions {
  bookId: string;
  containerRef: RefObject<HTMLDivElement | null>;
  viewRef: RefObject<FoliateView | null>;
  isAuthenticated: boolean;
  canLoadOffline?: boolean;
  progressLoading: boolean;
  progress: FoliateProgress | null;
  theme: ReaderTheme;
  getStylesheet: () => string;
  updateProgress: (cfi: string, percentage: number) => void;
  bindReaderDocument: (doc: Document, view?: FoliateView) => void | (() => void);
  onImageOpen?: (image: FoliateZoomImage) => void;
}
