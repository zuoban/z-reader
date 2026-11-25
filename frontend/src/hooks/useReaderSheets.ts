"use client";

import { useCallback, useState } from "react";

/** Manages mutually coordinated open state for reader drawers, settings, search, shortcuts, and TTS overlays. */
export function useReaderSheets() {
  const [tocOpen, setTocOpenState] = useState(false);
  const [bookmarksOpen, setBookmarksOpenState] = useState(false);
  const [shortcutsOpen, setShortcutsOpenState] = useState(false);
  const [themeSettingsOpen, setThemeSettingsOpenState] = useState(false);
  const [showSearch, setShowSearchState] = useState(false);
  const [ttsOpen, setTtsOpenState] = useState(false);

  const setTocOpen = useCallback((open: boolean) => {
    if (open) {
      setBookmarksOpenState(false);
      setThemeSettingsOpenState(false);
      setShortcutsOpenState(false);
      setShowSearchState(false);
      setTtsOpenState(false);
    }
    setTocOpenState(open);
  }, []);

  const setBookmarksOpen = useCallback((open: boolean) => {
    if (open) {
      setTocOpenState(false);
      setThemeSettingsOpenState(false);
      setShortcutsOpenState(false);
      setShowSearchState(false);
      setTtsOpenState(false);
    }
    setBookmarksOpenState(open);
  }, []);

  const setThemeSettingsOpen = useCallback((open: boolean) => {
    if (open) {
      setTocOpenState(false);
      setBookmarksOpenState(false);
      setShortcutsOpenState(false);
      setShowSearchState(false);
      setTtsOpenState(false);
    }
    setThemeSettingsOpenState(open);
  }, []);

  const setShortcutsOpen = useCallback((open: boolean) => {
    if (open) {
      setTocOpenState(false);
      setBookmarksOpenState(false);
      setThemeSettingsOpenState(false);
      setShowSearchState(false);
      setTtsOpenState(false);
    }
    setShortcutsOpenState(open);
  }, []);

  const setTtsOpen = useCallback((open: boolean) => {
    if (open) {
      setTocOpenState(false);
      setBookmarksOpenState(false);
      setThemeSettingsOpenState(false);
      setShortcutsOpenState(false);
      setShowSearchState(false);
    }
    setTtsOpenState(open);
  }, []);

  const openSearch = useCallback(() => {
    setTocOpenState(false);
    setBookmarksOpenState(false);
    setThemeSettingsOpenState(false);
    setShortcutsOpenState(false);
    setTtsOpenState(false);
    setShowSearchState(true);
  }, []);

  const closeSearch = useCallback(() => {
    setShowSearchState(false);
  }, []);

  const handleOpenShortcuts = useCallback(() => {
    setShortcutsOpen(true);
  }, [setShortcutsOpen]);

  const handleCloseShortcuts = useCallback(() => {
    setShortcutsOpenState(false);
  }, []);

  const handleToggleShortcuts = useCallback(() => {
    setShortcutsOpen(!shortcutsOpen);
  }, [setShortcutsOpen, shortcutsOpen]);

  const hasSheetOpen =
    tocOpen ||
    bookmarksOpen ||
    themeSettingsOpen ||
    shortcutsOpen ||
    showSearch ||
    ttsOpen;

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
