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

  function renderControls(options: { shortcutsOpen?: boolean; overlayOpen?: boolean } | boolean = false) {
    const resolved = typeof options === 'boolean' ? { shortcutsOpen: options } : options;
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const onBack = vi.fn();
    const onToggleShortcuts = vi.fn();
    const onCloseShortcuts = vi.fn();
    const { result } = renderHook(() => useReaderControls({
      pageRef: { current: page },
      onPrev,
      onNext,
      onBack,
      overlayOpen: resolved.overlayOpen ?? false,
      shortcutsOpen: resolved.shortcutsOpen ?? false,
      onToggleShortcuts,
      onCloseShortcuts,
    }));
    return { result, onPrev, onNext, onBack, onToggleShortcuts, onCloseShortcuts };
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
});
