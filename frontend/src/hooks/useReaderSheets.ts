"use client";

import { useCallback, useState } from "react";

/** Manages mutually coordinated open state for reader drawers, settings, and shortcuts overlays. */
export function useReaderSheets() {
  const [tocOpen, setTocOpen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [themeSettingsOpen, setThemeSettingsOpen] = useState(false);

  const handleOpenShortcuts = useCallback(() => {
    setTocOpen(false);
    setBookmarksOpen(false);
    setThemeSettingsOpen(false);
    setShortcutsOpen(true);
  }, []);

  const handleCloseShortcuts = useCallback(() => {
    setShortcutsOpen(false);
  }, []);

  const handleToggleShortcuts = useCallback(() => {
    if (!shortcutsOpen) {
      setTocOpen(false);
      setBookmarksOpen(false);
      setThemeSettingsOpen(false);
      setShortcutsOpen(true);
    } else {
      setShortcutsOpen(false);
    }
  }, [shortcutsOpen]);

  const hasSheetOpen =
    tocOpen || bookmarksOpen || themeSettingsOpen || shortcutsOpen;

  return {
    tocOpen,
    setTocOpen,
    bookmarksOpen,
    setBookmarksOpen,
    shortcutsOpen,
    setShortcutsOpen,
    themeSettingsOpen,
    setThemeSettingsOpen,
    hasSheetOpen,
    handleToggleShortcuts,
    handleOpenShortcuts,
    handleCloseShortcuts,
  };
}
