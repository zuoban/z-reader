"use client";

import { useCallback, useState } from "react";

/** Manages mutually coordinated open state for reader drawers, settings, search, and shortcuts overlays. */
export function useReaderSheets() {
  const [tocOpen, setTocOpenState] = useState(false);
  const [bookmarksOpen, setBookmarksOpenState] = useState(false);
  const [shortcutsOpen, setShortcutsOpenState] = useState(false);
  const [themeSettingsOpen, setThemeSettingsOpenState] = useState(false);
  const [showSearch, setShowSearchState] = useState(false);

  const setTocOpen = useCallback((open: boolean) => {
    if (open) {
      setBookmarksOpenState(false);
      setThemeSettingsOpenState(false);
      setShortcutsOpenState(false);
      setShowSearchState(false);
    }
    setTocOpenState(open);
  }, []);

  const setBookmarksOpen = useCallback((open: boolean) => {
    if (open) {
      setTocOpenState(false);
      setThemeSettingsOpenState(false);
      setShortcutsOpenState(false);
      setShowSearchState(false);
    }
    setBookmarksOpenState(open);
  }, []);

  const setThemeSettingsOpen = useCallback((open: boolean) => {
    if (open) {
      setTocOpenState(false);
      setBookmarksOpenState(false);
      setShortcutsOpenState(false);
      setShowSearchState(false);
    }
    setThemeSettingsOpenState(open);
  }, []);

  const setShortcutsOpen = useCallback((open: boolean) => {
    if (open) {
      setTocOpenState(false);
      setBookmarksOpenState(false);
      setThemeSettingsOpenState(false);
      setShowSearchState(false);
    }
    setShortcutsOpenState(open);
  }, []);

  const openSearch = useCallback(() => {
    setTocOpenState(false);
    setBookmarksOpenState(false);
    setThemeSettingsOpenState(false);
    setShortcutsOpenState(false);
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
    tocOpen || bookmarksOpen || themeSettingsOpen || shortcutsOpen || showSearch;

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
    hasSheetOpen,
    handleToggleShortcuts,
    handleOpenShortcuts,
    handleCloseShortcuts,
  };
}
