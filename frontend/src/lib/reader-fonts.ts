const READER_FONT_FAMILIES = new Set(['noto serif sc', 'crimson text', 'lxgw wenkai tc']);

function absoluteFontFace(rule: CSSFontFaceRule, baseURL: string, origin: string) {
  let isSelfHosted = true;
  const css = rule.cssText.replace(
    /url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/gi,
    (_, doubleQuoted: string, singleQuoted: string, unquoted: string) => {
      try {
        const url = new URL(doubleQuoted ?? singleQuoted ?? unquoted, baseURL);
        if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) {
          isSelfHosted = false;
        }
        return `url("${url.href}")`;
      } catch {
        isSelfHosted = false;
        return '';
      }
    },
  );
  return isSelfHosted ? css : '';
}

/** Reuse the app's bundled faces in blob chapters without importing app styles. */
export function getReaderFontFaces(doc: Document): string {
  const faces = new Set<string>();
  const visited = new Set<CSSStyleSheet>();
  const origin = new URL(doc.baseURI).origin;

  function collectRules(rules: CSSRuleList, baseURL: string) {
    for (const rule of Array.from(rules)) {
      if (rule.type === CSSRule.FONT_FACE_RULE) {
        const face = rule as CSSFontFaceRule;
        const family = face.style.getPropertyValue('font-family')
          .trim().replace(/^(['"])(.*)\1$/, '$2').toLowerCase();
        if (!READER_FONT_FAMILIES.has(family)) continue;
        const css = absoluteFontFace(face, baseURL, origin);
        if (css) faces.add(css);
      } else if (rule.type === CSSRule.IMPORT_RULE) {
        const imported = (rule as CSSImportRule).styleSheet;
        if (imported) collectSheet(imported, baseURL);
      } else if ('cssRules' in rule) {
        collectRules((rule as CSSGroupingRule).cssRules, baseURL);
      }
    }
  }

  function collectSheet(sheet: CSSStyleSheet, parentURL: string) {
    if (visited.has(sheet)) return;
    visited.add(sheet);
    try {
      collectRules(sheet.cssRules, sheet.href || parentURL);
    } catch {
      // Cross-origin stylesheets cannot be inspected; bundled app CSS is same-origin.
    }
  }

  for (const sheet of Array.from(doc.styleSheets)) collectSheet(sheet, doc.baseURI);
  return Array.from(faces).join('\n');
}
