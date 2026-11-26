"use client";

import { useCallback, useState } from "react";

type ReaderSheetKey =
  | "toc"
  | "bookmarks"
  | "shortcuts"
  | "theme"
  | "search"
  | "tts";

type MountedSheets = Partial<Record<ReaderSheetKey, true>>;

/** Manages mutually coordinated open state and sticky mount tracking for reader overlays. */
export function useReaderSheets() {
  const [activeSheet, setActiveSheet] = useState<ReaderSheetKey | null>(null);
  const [mountedSheets, setMountedSheets] = useState<MountedSheets>({});

  const markMounted = useCallback((sheet: ReaderSheetKey) => {
    setMountedSheets((prev) => (prev[sheet] ? prev : { ...prev, [sheet]: true }));
  }, []);

  const setSheetOpen = useCallback(
    (sheet: ReaderSheetKey, open: boolean) => {
      if (open) {
        markMounted(sheet);
        setActiveSheet(sheet);
        return;
      }
      setActiveSheet((current) => (current === sheet ? null : current));
    },
    [markMounted],
  );

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

  const openSearch = useCallback(() => setSheetOpen("search", true), [setSheetOpen]);
  const closeSearch = useCallback(() => setSheetOpen("search", false), [setSheetOpen]);
  const setSearchOpen = useCallback(
    (open: boolean) => setSheetOpen("search", open),
    [setSheetOpen],
  );
  const handleOpenShortcuts = useCallback(
    () => setSheetOpen("shortcuts", true),
    [setSheetOpen],
  );
  const handleCloseShortcuts = useCallback(
    () => setSheetOpen("shortcuts", false),
    [setSheetOpen],
  );
  const handleToggleShortcuts = useCallback(
    () => setActiveSheet((current) => (current === "shortcuts" ? null : "shortcuts")),
    [],
  );

  return {
    tocOpen: activeSheet === "toc",
    tocMounted: Boolean(mountedSheets.toc || activeSheet === "toc"),
    setTocOpen,
    bookmarksOpen: activeSheet === "bookmarks",
    bookmarksMounted: Boolean(mountedSheets.bookmarks || activeSheet === "bookmarks"),
    setBookmarksOpen,
    shortcutsOpen: activeSheet === "shortcuts",
    setShortcutsOpen,
    themeSettingsOpen: activeSheet === "theme",
    themeSettingsMounted: Boolean(mountedSheets.theme || activeSheet === "theme"),
    setThemeSettingsOpen,
    showSearch: activeSheet === "search",
    searchMounted: Boolean(mountedSheets.search || activeSheet === "search"),
    openSearch,
    closeSearch,
    setSearchOpen,
    ttsOpen: activeSheet === "tts",
    setTtsOpen,
    hasSheetOpen: activeSheet !== null,
    handleToggleShortcuts,
    handleOpenShortcuts,
    handleCloseShortcuts,
  };
}
