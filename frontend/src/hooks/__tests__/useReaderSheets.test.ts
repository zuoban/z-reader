import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useReaderSheets } from '@/hooks/useReaderSheets';

describe('useReaderSheets', () => {
  it('starts with all sheets closed and hasSheetOpen false', () => {
    const { result } = renderHook(() => useReaderSheets());

    expect(result.current.tocOpen).toBe(false);
    expect(result.current.bookmarksOpen).toBe(false);
    expect(result.current.shortcutsOpen).toBe(false);
    expect(result.current.themeSettingsOpen).toBe(false);
    expect(result.current.showSearch).toBe(false);
    expect(result.current.hasSheetOpen).toBe(false);
  });

  it('enforces mutual exclusion when opening each sheet', () => {
    const { result } = renderHook(() => useReaderSheets());

    act(() => result.current.setTocOpen(true));
    expect(result.current.tocOpen).toBe(true);
    expect(result.current.hasSheetOpen).toBe(true);

    act(() => result.current.setBookmarksOpen(true));
    expect(result.current.tocOpen).toBe(false);
    expect(result.current.bookmarksOpen).toBe(true);
    expect(result.current.hasSheetOpen).toBe(true);

    act(() => result.current.setThemeSettingsOpen(true));
    expect(result.current.bookmarksOpen).toBe(false);
    expect(result.current.themeSettingsOpen).toBe(true);
    expect(result.current.hasSheetOpen).toBe(true);

    act(() => result.current.setShortcutsOpen(true));
    expect(result.current.themeSettingsOpen).toBe(false);
    expect(result.current.shortcutsOpen).toBe(true);
    expect(result.current.hasSheetOpen).toBe(true);

    act(() => result.current.openSearch());
    expect(result.current.shortcutsOpen).toBe(false);
    expect(result.current.showSearch).toBe(true);
    expect(result.current.hasSheetOpen).toBe(true);

    act(() => result.current.setTocOpen(true));
    expect(result.current.showSearch).toBe(false);
    expect(result.current.tocOpen).toBe(true);
    expect(result.current.hasSheetOpen).toBe(true);
  });

  it('closes individual sheets and clears hasSheetOpen without affecting other open sheets', () => {
    const { result } = renderHook(() => useReaderSheets());

    act(() => result.current.setTocOpen(true));
    // Closing an already-closed sheet must not close the active sheet
    act(() => result.current.setBookmarksOpen(false));
    act(() => result.current.setThemeSettingsOpen(false));
    act(() => result.current.setShortcutsOpen(false));
    act(() => result.current.closeSearch());
    expect(result.current.tocOpen).toBe(true);
    expect(result.current.hasSheetOpen).toBe(true);

    act(() => result.current.setTocOpen(false));
    expect(result.current.tocOpen).toBe(false);
    expect(result.current.hasSheetOpen).toBe(false);

    act(() => result.current.openSearch());
    expect(result.current.showSearch).toBe(true);
    act(() => result.current.closeSearch());
    expect(result.current.showSearch).toBe(false);
    expect(result.current.hasSheetOpen).toBe(false);
  });

  it('handles open, close, and toggle shortcuts helpers with mutual exclusion', () => {
    const { result } = renderHook(() => useReaderSheets());

    act(() => result.current.setBookmarksOpen(true));
    act(() => result.current.handleOpenShortcuts());
    expect(result.current.bookmarksOpen).toBe(false);
    expect(result.current.shortcutsOpen).toBe(true);
    expect(result.current.hasSheetOpen).toBe(true);

    act(() => result.current.handleCloseShortcuts());
    expect(result.current.shortcutsOpen).toBe(false);
    expect(result.current.hasSheetOpen).toBe(false);

    act(() => result.current.setThemeSettingsOpen(true));
    act(() => result.current.handleToggleShortcuts());
    expect(result.current.themeSettingsOpen).toBe(false);
    expect(result.current.shortcutsOpen).toBe(true);

    act(() => result.current.handleToggleShortcuts());
    expect(result.current.shortcutsOpen).toBe(false);
    expect(result.current.hasSheetOpen).toBe(false);
  });

  it('keeps non-toggle callbacks referentially stable across state transitions', () => {
    const { result } = renderHook(() => useReaderSheets());
    const initial = {
      setTocOpen: result.current.setTocOpen,
      setBookmarksOpen: result.current.setBookmarksOpen,
      setThemeSettingsOpen: result.current.setThemeSettingsOpen,
      setShortcutsOpen: result.current.setShortcutsOpen,
      openSearch: result.current.openSearch,
      closeSearch: result.current.closeSearch,
      handleOpenShortcuts: result.current.handleOpenShortcuts,
      handleCloseShortcuts: result.current.handleCloseShortcuts,
    };

    act(() => result.current.setTocOpen(true));
    act(() => result.current.openSearch());
    act(() => result.current.handleOpenShortcuts());

    expect(result.current.setTocOpen).toBe(initial.setTocOpen);
    expect(result.current.setBookmarksOpen).toBe(initial.setBookmarksOpen);
    expect(result.current.setThemeSettingsOpen).toBe(initial.setThemeSettingsOpen);
    expect(result.current.setShortcutsOpen).toBe(initial.setShortcutsOpen);
    expect(result.current.openSearch).toBe(initial.openSearch);
    expect(result.current.closeSearch).toBe(initial.closeSearch);
    expect(result.current.handleOpenShortcuts).toBe(initial.handleOpenShortcuts);
    expect(result.current.handleCloseShortcuts).toBe(initial.handleCloseShortcuts);
  });
});
