import { fireEvent, render, screen } from '@/test/render';
import { describe, expect, it, vi } from 'vitest';
import { ShelfToolbar, type ShelfToolbarProps } from '@/components/shelf/ShelfToolbar';

function renderToolbar(overrides: Partial<ShelfToolbarProps> = {}) {
  const props: ShelfToolbarProps = {
    isOffline: false,
    isLoadingBooks: false,
    loadError: null,
    totalBookCount: 12,
    filteredBookCount: 12,
    selectedCategoryId: null,
    hasSearchQuery: false,
    showCategoryFilters: true,
    showShelfControlsSkeleton: false,
    searchQuery: '',
    isSearching: false,
    onSearchQueryChange: vi.fn(),
    sortBy: 'recent_read',
    onSortChange: vi.fn(),
    ...overrides,
  };
  return { ...render(<ShelfToolbar {...props} />), props };
}

describe('ShelfToolbar', () => {
  it('focuses the shelf search input on / and Cmd/Ctrl+K when no dialog or input is active', () => {
    renderToolbar({ searchQuery: '三体' });
    const searchInput = screen.getByRole('searchbox', { name: '搜索书库' });
    expect(document.activeElement).not.toBe(searchInput);

    const slashEvent = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
    window.dispatchEvent(slashEvent);
    expect(slashEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(searchInput);

    searchInput.blur();
    const cmdKEvent = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(cmdKEvent);
    expect(cmdKEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(searchInput);
  });

  it('ignores search focus shortcuts while typing in another input or when a dialog is open', () => {
    renderToolbar();
    const searchInput = screen.getByRole('searchbox', { name: '搜索书库' });

    const externalInput = document.createElement('input');
    document.body.appendChild(externalInput);
    externalInput.focus();
    const inInputEvent = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
    externalInput.dispatchEvent(inInputEvent);
    expect(inInputEvent.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(externalInput);
    externalInput.remove();

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    const inDialogEvent = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
    window.dispatchEvent(inDialogEvent);
    expect(inDialogEvent.defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(searchInput);
    dialog.remove();
  });

  it('clears search query on Escape and clear button click', () => {
    const onSearchQueryChange = vi.fn();
    renderToolbar({ searchQuery: '鲁迅', hasSearchQuery: true, onSearchQueryChange });
    const searchInput = screen.getByRole('searchbox', { name: '搜索书库' });

    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect(onSearchQueryChange).toHaveBeenCalledWith('');

    onSearchQueryChange.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '清除搜索' }));
    expect(onSearchQueryChange).toHaveBeenCalledWith('');
    expect(document.activeElement).toBe(searchInput);
  });

  it('blurs search input when pressing Escape with an empty query', () => {
    const onSearchQueryChange = vi.fn();
    renderToolbar({ searchQuery: '', hasSearchQuery: false, onSearchQueryChange });
    const searchInput = screen.getByRole('searchbox', { name: '搜索书库' });

    searchInput.focus();
    expect(document.activeElement).toBe(searchInput);

    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect(onSearchQueryChange).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(searchInput);
  });
});
