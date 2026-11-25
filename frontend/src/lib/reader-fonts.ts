const READER_FONT_FAMILIES = new Set(['noto serif sc', 'crimson text', 'lxgw wenkai tc']);

interface DocumentFontCache {
  sheets: CSSStyleSheet[];
  ruleCounts: number[];
  byFamily: Map<string, string>;
}

const documentFontCache = new WeakMap<Document, DocumentFontCache>();

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

function getSheetRuleCount(sheet: CSSStyleSheet): number {
  try {
    return sheet.cssRules.length;
  } catch {
    return -1;
  }
}

function collectDocumentFontFacesByFamily(doc: Document): Map<string, string> {
  const currentSheets = Array.from(doc.styleSheets);
  const currentRuleCounts = currentSheets.map(getSheetRuleCount);
  const cached = documentFontCache.get(doc);
  if (
    cached
    && cached.sheets.length === currentSheets.length
    && cached.sheets.every((sheet, index) => sheet === currentSheets[index])
    && cached.ruleCounts.every((count, index) => count === currentRuleCounts[index])
  ) {
    return cached.byFamily;
  }

  const facesByFamily = new Map<string, Set<string>>();
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
        if (!css) continue;
        let bucket = facesByFamily.get(family);
        if (!bucket) {
          bucket = new Set<string>();
          facesByFamily.set(family, bucket);
        }
        bucket.add(css);
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

  for (const sheet of currentSheets) collectSheet(sheet, doc.baseURI);

  const byFamily = new Map<string, string>();
  for (const [family, faces] of facesByFamily) {
    byFamily.set(family, Array.from(faces).join('\n'));
  }

  documentFontCache.set(doc, {
    sheets: currentSheets,
    ruleCounts: currentRuleCounts,
    byFamily,
  });
  return byFamily;
}

/** Reuse the app's bundled faces in blob chapters without importing app styles. */
export function getReaderFontFaces(doc: Document, families?: Iterable<string>): string {
  const requested = families === undefined
    ? Array.from(READER_FONT_FAMILIES)
    : Array.from(families, (family) => family.trim().toLowerCase()).filter((family) =>
      READER_FONT_FAMILIES.has(family),
    );
  if (requested.length === 0) return '';

  const byFamily = collectDocumentFontFacesByFamily(doc);
  const chunks: string[] = [];
  for (const family of new Set(requested)) {
    const css = byFamily.get(family);
    if (css) chunks.push(css);
  }
  return chunks.join('\n');
}
