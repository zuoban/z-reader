import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FONT_FAMILY_OPTIONS, useReaderTheme } from '@/hooks/useReaderTheme';

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
    expect(css).toContain(`${origin}/_next/static/media/wenkai-tc-400.woff2`);
    expect(css).toContain(`${origin}/_next/static/media/wenkai-tc-700.woff2`);
    expect(css).not.toContain('wenkai-full.woff2');
    const wenkaiFaces = (css.match(/@font-face\s*\{[^}]*\}/g) ?? [])
      .filter((rule) => rule.includes("'LXGW WenKai TC'"));
    expect(wenkaiFaces).toHaveLength(2);
    for (const face of wenkaiFaces) expect(face).toContain('unicode-range: U+4E00-4EFF');
    expect(wenkaiFaces[0]).toContain('font-weight: 400');
    expect(wenkaiFaces[1]).toContain('font-weight: 700');
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
    expect(editorialFace).toContain('/_next/static/media/noto-cjk.woff2');
    expect(css).toContain('font-family: "LXGW WenKai TC", "Kaiti SC", KaiTi, serif !important');
  });
});
