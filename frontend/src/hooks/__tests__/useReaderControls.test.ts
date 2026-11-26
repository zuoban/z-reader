import { fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useReaderControls } from '@/hooks/useReaderControls';

function touch(identifier: number, clientX: number, clientY = 40) {
  return { identifier, clientX, clientY };
}

describe('reader controls', () => {
  let page: HTMLDivElement;

  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    page = document.createElement('div');
    document.body.append(page);
  });

  afterEach(() => {
    page.remove();
    vi.unstubAllGlobals();
  });

  function renderControls(
    options: { shortcutsOpen?: boolean; overlayOpen?: boolean; onOpenSearch?: () => void } | boolean = false,
  ) {
    const resolved = typeof options === 'boolean' ? { shortcutsOpen: options } : options;
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const onBack = vi.fn();
    const onToggleShortcuts = vi.fn();
    const onCloseShortcuts = vi.fn();
    const { result, unmount } = renderHook(() => useReaderControls({
      pageRef: { current: page },
      onPrev,
      onNext,
      onBack,
      overlayOpen: resolved.overlayOpen ?? false,
      shortcutsOpen: resolved.shortcutsOpen ?? false,
      onToggleShortcuts,
      onCloseShortcuts,
      onOpenSearch: resolved.onOpenSearch,
    }));
    return { result, unmount, onPrev, onNext, onBack, onToggleShortcuts, onCloseShortcuts };
  }

  it.each([
    ['toolbar button', '<button>设置</button>'],
    ['settings slider', '<span role="slider" tabindex="0"></span>'],
    ['input', '<input>'],
    ['select', '<select><option>主题</option></select>'],
    ['settings panel', '<div role="dialog" tabindex="0"></div>'],
    ['interactive reader element', '<div data-reader-interactive="true"><span tabindex="0"></span></div>'],
  ])('leaves paging keys to a focused %s', (_label, markup) => {
    const { onPrev, onNext } = renderControls();
    page.innerHTML = markup;
    const control = page.querySelector<HTMLElement>('button, input, select, [tabindex]')!;
    control.focus();
    expect(control).toHaveFocus();

    expect(fireEvent.keyDown(control, { key: ' ' })).toBe(true);
    expect(fireEvent.keyDown(control, { key: ' ', shiftKey: true })).toBe(true);
    expect(fireEvent.keyDown(control, { key: 'ArrowRight' })).toBe(true);
    expect(fireEvent.keyDown(control, { key: 'ArrowLeft' })).toBe(true);
    expect(onPrev).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it('ignores a prevented keydown and still pages from the reading surface', () => {
    const { onPrev, onNext } = renderControls();
    page.tabIndex = -1;
    page.focus();
    page.addEventListener('keydown', (event) => event.preventDefault(), { once: true });

    fireEvent.keyDown(page, { key: 'ArrowRight' });
    expect(onNext).not.toHaveBeenCalled();

    fireEvent.keyDown(page, { key: 'ArrowRight' });
    fireEvent.keyDown(page, { key: ' ', shiftKey: true });
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('pages from Foliate iframe content and leaves focused iframe controls alone', () => {
    const { result, onPrev, onNext } = renderControls();
    const iframe = document.createElement('iframe');
    page.append(iframe);
    const frameDocument = iframe.contentDocument!;
    frameDocument.body.innerHTML = '<input><button>链接操作</button><p>正文</p>';
    result.current.bindReaderDocument(frameDocument);

    const input = frameDocument.querySelector('input')!;
    expect(input).not.toBeInstanceOf(HTMLInputElement);
    input.focus();
    expect(input).toHaveFocus();
    fireEvent.keyDown(input, { key: ' ' });

    const button = frameDocument.querySelector('button')!;
    button.focus();
    fireEvent.keyDown(button, { key: 'ArrowLeft' });
    expect(onPrev).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();

    button.blur();
    frameDocument.body.addEventListener('keydown', (event) => event.preventDefault(), { once: true });
    fireEvent.keyDown(frameDocument.body, { key: 'ArrowLeft' });
    expect(onPrev).not.toHaveBeenCalled();

    fireEvent.keyDown(frameDocument.body, { key: 'ArrowLeft' });
    fireEvent.keyDown(frameDocument.body, { key: ' ' });
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('ignores a pinch and still turns the page for the next single-finger swipe', () => {
    const { onPrev, onNext } = renderControls();
    const first = touch(1, 160);
    const second = touch(2, 110);
    fireEvent.touchStart(page, { touches: [first] });
    fireEvent.touchStart(page, { touches: [first, second] });
    fireEvent.touchEnd(page, { touches: [second], changedTouches: [touch(1, 30)] });
    fireEvent.touchEnd(page, { touches: [], changedTouches: [touch(2, 220)] });
    expect(onPrev).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();

    fireEvent.touchStart(page, { touches: [touch(3, 160)] });
    fireEvent.touchEnd(page, { touches: [], changedTouches: [touch(3, 30)] });
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('ignores a cancelled swipe and a touch end with a different identifier in an iframe', () => {
    const { result, onNext } = renderControls();
    const frame = document.createElement('iframe');
    page.append(frame);
    const frameDocument = frame.contentDocument!;
    const surface = frameDocument.body;
    const unbind = result.current.bindReaderDocument(frameDocument);

    try {
      fireEvent.touchStart(surface, { touches: [touch(1, 160)] });
      fireEvent.touchCancel(surface, { touches: [], changedTouches: [touch(1, 120)] });
      fireEvent.touchEnd(surface, { touches: [], changedTouches: [touch(1, 30)] });

      fireEvent.touchStart(surface, { touches: [touch(2, 160)] });
      fireEvent.touchEnd(surface, { touches: [], changedTouches: [touch(3, 30)] });
      expect(onNext).not.toHaveBeenCalled();

      fireEvent.touchStart(surface, { touches: [touch(4, 160)] });
      fireEvent.touchEnd(surface, { touches: [], changedTouches: [touch(4, 30)] });
      expect(onNext).toHaveBeenCalledOnce();

      surface.addEventListener('touchend', (event) => event.preventDefault(), { once: true });
      fireEvent.touchStart(surface, { touches: [touch(5, 160)] });
      fireEvent.touchEnd(surface, { touches: [], changedTouches: [touch(5, 30)] });
      expect(onNext).toHaveBeenCalledOnce();
    } finally {
      unbind?.();
    }
  });

  it('keeps help and Escape available when a button has focus', () => {
    const { onBack, onToggleShortcuts } = renderControls();
    const button = document.createElement('button');
    page.append(button);
    button.focus();

    fireEvent.keyDown(button, { key: '?' });
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(onToggleShortcuts).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('leaves keyboard input to the open image zoom overlay', () => {
    const { onNext, onBack, onToggleShortcuts } = renderControls();
    page.dataset.readerImageZoomOpen = 'true';

    fireEvent.keyDown(page, { key: 'ArrowRight' });
    fireEvent.keyDown(page, { key: '?' });
    fireEvent.keyDown(page, { key: 'Escape' });
    expect(onNext).not.toHaveBeenCalled();
    expect(onToggleShortcuts).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('closes the shortcut dialog with Escape and blocks paging while it is open', () => {
    const { onCloseShortcuts, onBack, onNext } = renderControls(true);

    fireEvent.keyDown(page, { key: 'ArrowRight' });
    fireEvent.keyDown(page, { key: 'Escape' });
    expect(onNext).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
    expect(onCloseShortcuts).toHaveBeenCalledTimes(1);
  });

  it('does not exit reader or fullscreen on Escape when a reader overlay is open', () => {
    const { onBack, onNext } = renderControls({ overlayOpen: true });
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: page,
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreen,
    });

    try {
      fireEvent.keyDown(page, { key: 'ArrowRight' });
      fireEvent.keyDown(page, { key: 'Escape' });
      expect(onNext).not.toHaveBeenCalled();
      expect(onBack).not.toHaveBeenCalled();
      expect(exitFullscreen).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        value: null,
      });
    }
  });

  it('ignores Escape when a visible dialog or listbox is mounted, but not aria-hidden ones', () => {
    const { onBack } = renderControls();

    const hiddenDialog = document.createElement('div');
    hiddenDialog.setAttribute('role', 'dialog');
    hiddenDialog.setAttribute('aria-hidden', 'true');
    page.append(hiddenDialog);

    fireEvent.keyDown(page, { key: 'Escape' });
    expect(onBack).toHaveBeenCalledTimes(1);

    const visibleDialog = document.createElement('div');
    visibleDialog.setAttribute('role', 'dialog');
    page.append(visibleDialog);

    fireEvent.keyDown(page, { key: 'Escape' });
    expect(onBack).toHaveBeenCalledTimes(1);

    visibleDialog.remove();
    const visibleListbox = document.createElement('div');
    visibleListbox.setAttribute('role', 'listbox');
    page.append(visibleListbox);

    fireEvent.keyDown(page, { key: 'Escape' });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('reports fullscreen support from the boolean value of document.fullscreenEnabled', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenEnabled');
    try {
      Object.defineProperty(document, 'fullscreenEnabled', {
        configurable: true,
        value: false,
      });
      expect(renderControls().result.current.isFullscreenSupported).toBe(false);

      Object.defineProperty(document, 'fullscreenEnabled', {
        configurable: true,
        value: true,
      });
      expect(renderControls().result.current.isFullscreenSupported).toBe(true);
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(document, 'fullscreenEnabled', originalDescriptor);
      } else {
        delete (document as { fullscreenEnabled?: boolean }).fullscreenEnabled;
      }
    }
  });

  it('ignores browser modifier shortcuts and IME composition keydowns', () => {
    const { onPrev, onNext, onBack, onToggleShortcuts } = renderControls();
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const originalFullscreenEnabled = Object.getOwnPropertyDescriptor(document, 'fullscreenEnabled');
    Object.defineProperty(document, 'fullscreenEnabled', {
      configurable: true,
      value: true,
    });
    page.requestFullscreen = requestFullscreen;

    try {
      fireEvent.keyDown(page, { key: 'f', ctrlKey: true });
      fireEvent.keyDown(page, { key: 'f', metaKey: true });
      fireEvent.keyDown(page, { key: 'k', metaKey: true });
      fireEvent.keyDown(page, { key: 'j', ctrlKey: true });
      fireEvent.keyDown(page, { key: 'ArrowLeft', altKey: true });
      fireEvent.keyDown(page, { key: 'ArrowRight', metaKey: true });
      fireEvent.keyDown(page, { key: 'Escape', ctrlKey: true });

      const composingEvent = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(composingEvent, 'isComposing', { value: true });
      page.dispatchEvent(composingEvent);

      expect(requestFullscreen).not.toHaveBeenCalled();
      expect(onPrev).not.toHaveBeenCalled();
      expect(onNext).not.toHaveBeenCalled();
      expect(onBack).not.toHaveBeenCalled();
      expect(onToggleShortcuts).not.toHaveBeenCalled();
    } finally {
      if (originalFullscreenEnabled) {
        Object.defineProperty(document, 'fullscreenEnabled', originalFullscreenEnabled);
      } else {
        delete (document as { fullscreenEnabled?: boolean }).fullscreenEnabled;
      }
    }
  });

  it('does not open shortcuts while another overlay is active, but still lets ? close open shortcuts', () => {
    const blocked = renderControls({ overlayOpen: true, shortcutsOpen: false });
    fireEvent.keyDown(page, { key: '?' });
    expect(blocked.onToggleShortcuts).not.toHaveBeenCalled();
    blocked.unmount();

    const active = renderControls({ overlayOpen: true, shortcutsOpen: true });
    fireEvent.keyDown(page, { key: '?' });
    expect(active.onToggleShortcuts).toHaveBeenCalledTimes(1);
    active.unmount();
  });

  it('binds Cmd/Ctrl+F to onOpenSearch when provided and ignores inputs/textareas', () => {
    const onOpenSearch = vi.fn();
    const { result } = renderControls({ onOpenSearch });

    const ctrlEvent = new KeyboardEvent('keydown', {
      key: 'f',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    page.dispatchEvent(ctrlEvent);
    expect(ctrlEvent.defaultPrevented).toBe(true);
    expect(onOpenSearch).toHaveBeenCalledTimes(1);

    const metaEvent = new KeyboardEvent('keydown', {
      key: 'F',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    page.dispatchEvent(metaEvent);
    expect(metaEvent.defaultPrevented).toBe(true);
    expect(onOpenSearch).toHaveBeenCalledTimes(2);

    // Input and textarea should not trigger reader search shortcut
    page.innerHTML = '<input type="search" /><textarea></textarea>';
    const input = page.querySelector('input')!;
    const textarea = page.querySelector('textarea')!;
    input.focus();
    const inputEvent = new KeyboardEvent('keydown', {
      key: 'f',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(inputEvent);
    expect(inputEvent.defaultPrevented).toBe(false);
    expect(onOpenSearch).toHaveBeenCalledTimes(2);

    textarea.focus();
    const textareaEvent = new KeyboardEvent('keydown', {
      key: 'f',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(textareaEvent);
    expect(textareaEvent.defaultPrevented).toBe(false);
    expect(onOpenSearch).toHaveBeenCalledTimes(2);

    // Also works from inside bound foliate iframe document
    const iframe = document.createElement('iframe');
    page.append(iframe);
    const frameDoc = iframe.contentDocument!;
    result.current.bindReaderDocument(frameDoc);
    const iframeEvent = new KeyboardEvent('keydown', {
      key: 'f',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    frameDoc.body.dispatchEvent(iframeEvent);
    expect(iframeEvent.defaultPrevented).toBe(true);
    expect(onOpenSearch).toHaveBeenCalledTimes(3);
  });

  it('opens TOC (T), bookmarks (B), and theme settings (S) while ignoring inputs, modifiers, and open overlays', () => {
    const page = document.createElement('div');
    document.body.append(page);
    const onOpenTOC = vi.fn();
    const onOpenBookmarks = vi.fn();
    const onOpenThemeSettings = vi.fn();

    const { rerender } = renderHook(
      ({ overlayOpen }) =>
        useReaderControls({
          pageRef: { current: page },
          onPrev: vi.fn(),
          onNext: vi.fn(),
          onBack: vi.fn(),
          overlayOpen,
          onOpenTOC,
          onOpenBookmarks,
          onOpenThemeSettings,
        }),
      { initialProps: { overlayOpen: false } },
    );

    const tEvent = new KeyboardEvent('keydown', { key: 't', bubbles: true, cancelable: true });
    page.dispatchEvent(tEvent);
    expect(tEvent.defaultPrevented).toBe(true);
    expect(onOpenTOC).toHaveBeenCalledTimes(1);

    const bEvent = new KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true });
    page.dispatchEvent(bEvent);
    expect(bEvent.defaultPrevented).toBe(true);
    expect(onOpenBookmarks).toHaveBeenCalledTimes(1);

    const sEvent = new KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true });
    page.dispatchEvent(sEvent);
    expect(sEvent.defaultPrevented).toBe(true);
    expect(onOpenThemeSettings).toHaveBeenCalledTimes(1);

    // Shift/Ctrl/Meta modifiers must not trigger single-key sheet shortcuts
    page.dispatchEvent(new KeyboardEvent('keydown', { key: 'T', shiftKey: true, bubbles: true, cancelable: true }));
    page.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true }));
    page.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true, cancelable: true }));
    expect(onOpenTOC).toHaveBeenCalledTimes(1);
    expect(onOpenBookmarks).toHaveBeenCalledTimes(1);
    expect(onOpenThemeSettings).toHaveBeenCalledTimes(1);

    // Blocked when an overlay is already open
    rerender({ overlayOpen: true });
    page.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true, cancelable: true }));
    page.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true }));
    page.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true }));
    expect(onOpenTOC).toHaveBeenCalledTimes(1);
    expect(onOpenBookmarks).toHaveBeenCalledTimes(1);
    expect(onOpenThemeSettings).toHaveBeenCalledTimes(1);

    // Also blocked inside input controls
    rerender({ overlayOpen: false });
    page.innerHTML = '<input type="text" /><button type="button">Action</button>';
    const input = page.querySelector('input')!;
    const button = page.querySelector('button')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true, cancelable: true }));
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true }));
    expect(onOpenTOC).toHaveBeenCalledTimes(1);
    expect(onOpenBookmarks).toHaveBeenCalledTimes(1);
  });

  it('swallows rejected document.exitFullscreen promises when pressing Escape in fullscreen', async () => {
    const { onBack } = renderControls();
    const exitFullscreen = vi.fn(() => Promise.reject(new Error('Document not active')));
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: page,
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreen,
    });

    try {
      fireEvent.keyDown(page, { key: 'Escape' });
      expect(exitFullscreen).toHaveBeenCalledTimes(1);
      expect(onBack).not.toHaveBeenCalled();
      // Flush microtasks so an unhandled rejection would surface in Vitest.
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        value: null,
      });
    }
  });

  it('cycles preset (P) and steps font size ([ and ]) unless blocked by overlay or modifiers', () => {
    const localPage = document.createElement('div');
    document.body.append(localPage);
    const onCyclePreset = vi.fn();
    const onStepFontSize = vi.fn();

    const { rerender, unmount } = renderHook(
      ({ overlayOpen }) =>
        useReaderControls({
          pageRef: { current: localPage },
          onPrev: vi.fn(),
          onNext: vi.fn(),
          onBack: vi.fn(),
          overlayOpen,
          onCyclePreset,
          onStepFontSize,
        }),
      { initialProps: { overlayOpen: false } },
    );

    try {
      const pEvent = new KeyboardEvent('keydown', { key: 'p', bubbles: true, cancelable: true });
      localPage.dispatchEvent(pEvent);
      expect(pEvent.defaultPrevented).toBe(true);
      expect(onCyclePreset).toHaveBeenCalledTimes(1);

      const decEvent = new KeyboardEvent('keydown', { key: '[', bubbles: true, cancelable: true });
      localPage.dispatchEvent(decEvent);
      expect(decEvent.defaultPrevented).toBe(true);
      expect(onStepFontSize).toHaveBeenNthCalledWith(1, -1);

      const incEvent = new KeyboardEvent('keydown', { key: ']', bubbles: true, cancelable: true });
      localPage.dispatchEvent(incEvent);
      expect(incEvent.defaultPrevented).toBe(true);
      expect(onStepFontSize).toHaveBeenNthCalledWith(2, 1);

      // Modifier keys do not trigger single-key shortcuts
      localPage.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true }));
      localPage.dispatchEvent(new KeyboardEvent('keydown', { key: '[', metaKey: true, bubbles: true, cancelable: true }));
      expect(onCyclePreset).toHaveBeenCalledTimes(1);
      expect(onStepFontSize).toHaveBeenCalledTimes(2);

      // Blocked when overlay is open
      rerender({ overlayOpen: true });
      localPage.dispatchEvent(new KeyboardEvent('keydown', { key: 'P', bubbles: true, cancelable: true }));
      localPage.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true, cancelable: true }));
      expect(onCyclePreset).toHaveBeenCalledTimes(1);
      expect(onStepFontSize).toHaveBeenCalledTimes(2);
    } finally {
      unmount();
      localPage.remove();
    }
  });
});
