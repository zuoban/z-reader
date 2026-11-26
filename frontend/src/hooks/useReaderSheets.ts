"use client";

import { useCallback, useState } from "react";

type ReaderSheetKey =
  | "toc"
  | "bookmarks"
  | "shortcuts"
  | "theme"
  | "search"
  | "tts";

/** Manages mutually coordinated open state for reader drawers, settings, search, shortcuts, and TTS overlays. */
export function useReaderSheets() {
  const [activeSheet, setActiveSheet] = useState<ReaderSheetKey | null>(null);

  const setSheetOpen = useCallback((sheet: ReaderSheetKey, open: boolean) => {
    setActiveSheet((current) => (open ? sheet : current === sheet ? null : current));
  }, []);

  const setTocOpen = useCallback(
    (open: boolean) => setSheetOpen("toc", open),
    [setSheetOpen],
  );
  const setBookmarksOpen = useCallback(
    (open: boolean) => setSheetOpen("bookmarks", open),
    [setSheetOpen],
  );
  const setThemeSettingsOpen = useCallback(
    (open: boolean) => setSheetOpen("theme", open),
    [setSheetOpen],
  );
  const setShortcutsOpen = useCallback(
    (open: boolean) => setSheetOpen("shortcuts", open),
    [setSheetOpen],
  );
  const setTtsOpen = useCallback(
    (open: boolean) => setSheetOpen("tts", open),
    [setSheetOpen],
  );

  const openSearch = useCallback(() => setActiveSheet("search"), []);
  const closeSearch = useCallback(
    () => setActiveSheet((current) => (current === "search" ? null : current)),
    [],
  );
  const handleOpenShortcuts = useCallback(() => setActiveSheet("shortcuts"), []);
  const handleCloseShortcuts = useCallback(
    () => setActiveSheet((current) => (current === "shortcuts" ? null : current)),
    [],
  );
  const handleToggleShortcuts = useCallback(
    () => setActiveSheet((current) => (current === "shortcuts" ? null : "shortcuts")),
    [],
  );

  const tocOpen = activeSheet === "toc";
  const bookmarksOpen = activeSheet === "bookmarks";
  const shortcutsOpen = activeSheet === "shortcuts";
  const themeSettingsOpen = activeSheet === "theme";
  const showSearch = activeSheet === "search";
  const ttsOpen = activeSheet === "tts";
  const hasSheetOpen = activeSheet !== null;

  return {
    tocOpen,
    setTocOpen,
    bookmarksOpen,
    setBookmarksOpen,
    shortcutsOpen,
    setShortcutsOpen,
    themeSettingsOpen,
    setThemeSettingsOpen,
    showSearch,
    openSearch,
    closeSearch,
    ttsOpen,
    setTtsOpen,
    hasSheetOpen,
    handleToggleShortcuts,
    handleOpenShortcuts,
    handleCloseShortcuts,
  };
}
