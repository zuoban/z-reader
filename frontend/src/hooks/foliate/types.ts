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
