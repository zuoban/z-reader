"use client";

import type { RefObject } from "react";
import { FoliateView } from "@/lib/types";
import type { ReaderTheme } from "@/hooks/useReaderTheme";
import { useFoliateView } from "@/hooks/useFoliateView";

interface UseFoliateReaderOptions {
  bookId: string;
  containerRef: RefObject<HTMLDivElement | null>;
  viewRef: RefObject<FoliateView | null>;
  isAuthenticated: boolean;
  progressLoading: boolean;
  progress: { cfi: string; percentage: number } | null;
  theme: ReaderTheme;
  getStylesheet: () => string;
  updateProgress: (cfi: string, percentage: number) => void;
  bindReaderDocument: (doc: Document) => void;
  bindHeaderInteractionDocument: (doc: Document) => void;
  cleanupHeaderInteractionDocuments: () => void;
}

export function useFoliateReader(options: UseFoliateReaderOptions) {
  return useFoliateView(options);
}
