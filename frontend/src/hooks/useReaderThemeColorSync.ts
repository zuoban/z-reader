"use client";

import { useEffect } from "react";
import type { ReaderTheme } from "@/hooks/useReaderTheme";
import {
  applyThemeColor,
  themeColorForAppMode,
  themeColorForPreset,
} from "@/lib/theme-color";

/** Syncs browser/PWA chrome theme color with the active reader preset and restores shelf theme on unmount. */
export function useReaderThemeColorSync(preset: ReaderTheme["preset"]) {
  useEffect(() => {
    const root = document.documentElement;
    const color = themeColorForPreset(preset);
    root.dataset.readerActivePreset = preset;
    root.style.colorScheme = preset === "dark" ? "dark" : "light";
    applyThemeColor(color);

    return () => {
      delete root.dataset.readerActivePreset;
      const shelfPreset = root.dataset.readerPreset;
      if (
        shelfPreset === "light" ||
        shelfPreset === "sepia" ||
        shelfPreset === "green" ||
        shelfPreset === "dark"
      ) {
        root.style.colorScheme = shelfPreset === "dark" ? "dark" : "light";
        applyThemeColor(themeColorForAppMode(shelfPreset === "dark"));
        return;
      }
      const shelfIsDark = root.classList.contains("dark");
      root.style.colorScheme = shelfIsDark ? "dark" : "light";
      applyThemeColor(themeColorForAppMode(shelfIsDark));
    };
  }, [preset]);
}
