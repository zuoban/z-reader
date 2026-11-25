import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_READER_THEME, FONT_FAMILY_OPTIONS, useReaderTheme } from '@/hooks/useReaderTheme';
import { getReaderFontFaces } from '@/lib/reader-fonts';

describe('reader font stylesheets', () => {
  const styles: HTMLStyleElement[] = [];

  function addStyles(css: string, href?: string) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    styles.push(style);
    // jsdom 29 serializes font-face with ordinary style properties, dropping
    // src, unicode-range and font-display. Keep browser-valid fixture descriptors.
    const faces = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    function restoreDescriptors(rules: CSSRuleList) {
      for (const rule of Array.from(rules)) {
        if (rule.type === CSSRule.FONT_FACE_RULE) {
          Object.defineProperty(rule, 'cssText', { value: faces.shift() });
        } else if ('cssRules' in rule) {
          restoreDescriptors((rule as CSSGroupingRule).cssRules);
        }
      }
    }
    restoreDescriptors(style.sheet!.cssRules);
    if (href) Object.defineProperty(style.sheet, 'href', { value: href });
    return style.sheet!;
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => styles.splice(0).forEach((style) => style.remove()));

  it('copies reader font faces with absolute asset URLs and their original descriptors', () => {
    const origin = window.location.origin;
    addStyles(`
      @font-face {
        font-family: 'Noto Serif SC'; font-style: normal; font-weight: 400;
        font-display: swap; unicode-range: U+4E00-4EFF;
        src: url('../media/noto-400.woff2?v=4#face') format('woff2');
      }
      @font-face {
        font-family: 'Noto Serif SC'; font-weight: 600;
        unicode-range: U+3018-301B;
        src: url('/_next/static/media/noto-compat.woff2') format('woff2');
      }
      @font-face {
        font-family: 'Crimson Text'; font-weight: 400;
        src: url("../media/crimson.woff2") format('woff2');
      }
      @font-face {
        font-family: 'LXGW WenKai TC'; font-weight: 400; font-display: swap;
        unicode-range: U+4E00-4EFF;
        src: url('../media/wenkai-tc-400.woff2') format('woff2');
      }
      @font-face {
        font-family: 'LXGW WenKai TC'; font-weight: 700; font-display: swap;
        unicode-range: U+4E00-4EFF;
        src: url('../media/wenkai-tc-700.woff2') format('woff2');
      }
      @font-face {
        font-family: 'LXGW WenKai'; font-weight: 400;
        src: url('../media/wenkai-full.woff2') format('woff2');
      }
      @font-face {
        font-family: 'Playfair Display'; src: url('../media/playfair.woff2');
      }
      .app-only-rule { color: red; }
    `, `${origin}/_next/static/css/app.css`);

    const { result } = renderHook(() => useReaderTheme());
    const css = result.current.getStylesheet();

    expect(css).toContain(`${origin}/_next/static/media/noto-400.woff2?v=4#face`);
    expect(css).toContain(`${origin}/_next/static/media/noto-compat.woff2`);
    expect(css).toContain(`${origin}/_next/static/media/crimson.woff2`);
    expect(css).not.toContain('wenkai-tc-400.woff2');
    expect(css).not.toContain('wenkai-tc-700.woff2');
    expect(css).not.toContain('wenkai-full.woff2');
    expect(css).toContain('unicode-range: U+4E00-4EFF');
    expect(css).toContain('unicode-range: U+3018-301B');
    expect(css).toContain('font-display: swap');
    expect(css).toContain('font-weight: 600');
    expect(css).not.toContain('Playfair Display');
    expect(css).not.toContain('app-only-rule');
    expect(css.indexOf('@font-face')).toBeLessThan(css.indexOf('html {'));
  });

  it('finds nested faces without copying page styles or requesting external assets', () => {
    addStyles(`
      @media screen {
        @font-face { font-family: 'Noto Serif SC'; src: url('./fonts/noto.woff2'); }
      }
      @font-face {
        font-family: 'Noto Serif SC'; src: url('https://fonts.example/noto.woff2');
      }
    `);
    const inaccessible = addStyles('.external { color: blue; }');
    Object.defineProperty(inaccessible, 'cssRules', {
      get() { throw new DOMException('Cross-origin stylesheet', 'SecurityError'); },
    });

    const { result } = renderHook(() => useReaderTheme());
    const css = result.current.getStylesheet();

    expect(css).toContain(new URL('./fonts/noto.woff2', document.baseURI).href);
    expect(css).not.toContain('fonts.example');
    expect(css).not.toContain('.external');
  });

  it('renders saved classic Chinese with its own bundled CJK face before system fallbacks', () => {
    localStorage.setItem('z-reader-theme', JSON.stringify({ fontFamily: 'classic' }));
    addStyles(`
      @font-face {
        font-family: 'Noto Serif SC'; font-weight: 400; unicode-range: U+4E00-9FFF;
        src: url('/_next/static/media/noto-cjk.woff2') format('woff2');
      }
      @font-face {
        font-family: 'LXGW WenKai TC'; font-weight: 400; unicode-range: U+4E00-9FFF;
        src: url('/_next/static/media/wenkai-tc-cjk.woff2') format('woff2');
      }
    `);
    const { result } = renderHook(() => useReaderTheme());
    const css = result.current.getStylesheet();
    const faceRules = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    const classicFace = faceRules.find((rule) => rule.includes("'LXGW WenKai TC'"));
    const editorialFace = faceRules.find((rule) => rule.includes("'Noto Serif SC'"));

    expect(result.current.theme.fontFamily).toBe('classic');
    expect(FONT_FAMILY_OPTIONS.classic.stack.split(',')[0]).toBe('"LXGW WenKai TC"');
    expect(classicFace).toContain('unicode-range: U+4E00-9FFF');
    expect(classicFace).toContain('/_next/static/media/wenkai-tc-cjk.woff2');
    expect(editorialFace).toBeUndefined();
    expect(css).toContain('font-family: "LXGW WenKai TC", "Kaiti SC", KaiTi, serif !important');
  });

  it('omits bundled @font-face rules when humanist font family is active', () => {
    localStorage.setItem('z-reader-theme', JSON.stringify({ fontFamily: 'humanist' }));
    addStyles(`
      @font-face {
        font-family: 'Noto Serif SC'; font-weight: 400;
        src: url('/_next/static/media/noto-cjk.woff2') format('woff2');
      }
      @font-face {
        font-family: 'LXGW WenKai TC'; font-weight: 400;
        src: url('/_next/static/media/wenkai-tc-cjk.woff2') format('woff2');
      }
    `);
    const { result } = renderHook(() => useReaderTheme());
    const css = result.current.getStylesheet();

    expect(css).not.toContain('@font-face');
    expect(css).toContain('font-family: "Noto Sans SC"');
  });

  it('caches parsed document font faces until stylesheets change', () => {
    const sheet = addStyles(`
      @font-face {
        font-family: 'Noto Serif SC'; font-weight: 400;
        src: url('/_next/static/media/noto-cache.woff2') format('woff2');
      }
    `);
    const faceRule = sheet.cssRules[0];
    const getPropertyValueSpy = vi.spyOn(
      (faceRule as CSSFontFaceRule).style,
      'getPropertyValue',
    );

    const first = getReaderFontFaces(document, ['noto serif sc']);
    const second = getReaderFontFaces(document, ['noto serif sc']);

    expect(first).toContain('noto-cache.woff2');
    expect(second).toBe(first);
    expect(getPropertyValueSpy).toHaveBeenCalledTimes(1);

    addStyles(`
      @font-face {
        font-family: 'LXGW WenKai TC'; font-weight: 400;
        src: url('/_next/static/media/wenkai-added.woff2') format('woff2');
      }
    `);
    const classic = getReaderFontFaces(document, ['lxgw wenkai tc']);
    expect(classic).toContain('wenkai-added.woff2');
  });

  it('syncs iframe color-scheme and link focus-visible outline with the active reader preset', () => {
    localStorage.setItem('z-reader-theme', JSON.stringify({ preset: 'dark' }));
    const { result, unmount } = renderHook(() => useReaderTheme());
    const darkCss = result.current.getStylesheet();

    expect(darkCss).toContain('color-scheme: dark;');
    expect(darkCss).toContain('a:focus-visible');
    expect(darkCss).toContain('outline: 2px solid #e4a186;');
    unmount();

    localStorage.setItem('z-reader-theme', JSON.stringify({ preset: 'sepia' }));
    const sepiaHook = renderHook(() => useReaderTheme());
    const sepiaCss = sepiaHook.result.current.getStylesheet();

    expect(sepiaCss).toContain('color-scheme: light;');
    expect(sepiaCss).toContain('outline: 2px solid #7a4e2a;');
  });

  it('preserves gap: 0 and clamps numeric zero inputs instead of clobbering to defaults', () => {
    const { result, unmount } = renderHook(() => useReaderTheme());

    act(() => {
      result.current.setTheme({ gap: 0, pagePaddingX: 0, pagePaddingY: 0 });
    });

    expect(result.current.theme.gap).toBe(0);
    expect(result.current.theme.pagePaddingX).toBe(8);
    expect(result.current.theme.pagePaddingY).toBe(8);
    unmount();

    // Reloading from localStorage must preserve gap: 0 and fall back only for non-finite values.
    localStorage.setItem(
      'z-reader-theme',
      JSON.stringify({ gap: 0, fontSize: '', pagePaddingX: null }),
    );
    const reloaded = renderHook(() => useReaderTheme());
    expect(reloaded.result.current.theme.gap).toBe(0);
    expect(reloaded.result.current.theme.fontSize).toBe(DEFAULT_READER_THEME.fontSize);
    expect(reloaded.result.current.theme.pagePaddingX).toBe(DEFAULT_READER_THEME.pagePaddingX);
    reloaded.unmount();
  });
});
