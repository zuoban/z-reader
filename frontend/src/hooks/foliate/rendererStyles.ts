import { PRESET_STYLES, type ReaderTheme } from "@/hooks/useReaderTheme";
import type { FoliateView } from "@/lib/types";

const DARK_OVERRIDES_STYLE_ID = "z-reader-dark-overrides";

export interface AppliedRendererStyleCache {
  stylesheet: { view: FoliateView; stylesheet: string } | null;
  preferences: { view: FoliateView; key: string } | null;
  inlinePreset: { view: FoliateView; preset: ReaderTheme["preset"] } | null;
}

export function createAppliedStyleCache(): AppliedRendererStyleCache {
  return {
    stylesheet: null,
    preferences: null,
    inlinePreset: null,
  };
}

export function resetAppliedStyleCache(cache: AppliedRendererStyleCache): void {
  cache.stylesheet = null;
  cache.preferences = null;
  cache.inlinePreset = null;
}

export function getRendererPreferencesKey(
  theme: ReaderTheme,
  compatibilityMode: boolean,
): string {
  return `${compatibilityMode}|${theme.flow}|${theme.gap}|${theme.maxInlineSize}|${theme.animated}`;
}

export function syncRendererStylesheet(
  view: FoliateView,
  stylesheet: string,
  cache: AppliedRendererStyleCache,
): void {
  if (
    cache.stylesheet?.view === view &&
    cache.stylesheet.stylesheet === stylesheet
  ) {
    return;
  }
  view.renderer?.setStyles?.(stylesheet);
  cache.stylesheet = { view, stylesheet };
}

export function syncRendererPreferences(
  view: FoliateView,
  theme: ReaderTheme,
  compatibilityMode: boolean,
  cache: AppliedRendererStyleCache,
): void {
  const renderer = view.renderer;
  if (!renderer) return;
  const key = getRendererPreferencesKey(theme, compatibilityMode);
  if (cache.preferences?.view === view && cache.preferences.key === key) {
    return;
  }
  cache.preferences = { view, key };
  renderer.setAttribute("margin", "0");
  renderer.setAttribute("flow", compatibilityMode ? "scrolled" : theme.flow);
  renderer.setAttribute("gap", `${compatibilityMode ? 0 : theme.gap}%`);
  renderer.setAttribute(
    "max-inline-size",
    `${compatibilityMode ? 720 : theme.maxInlineSize}px`,
  );
  if (theme.animated && !compatibilityMode) {
    renderer.setAttribute("animated", "");
  } else {
    renderer.removeAttribute("animated");
  }
}

export function syncRendererInlineOverrides(
  view: FoliateView,
  preset: ReaderTheme["preset"],
  cache: AppliedRendererStyleCache,
): void {
  if (cache.inlinePreset?.view === view && cache.inlinePreset.preset === preset) {
    return;
  }
  cache.inlinePreset = { view, preset };
  const contents = view.renderer?.getContents?.() ?? [];
  contents.forEach(({ doc }) => {
    if (!doc) return;
    applyDarkInlineOverrides(doc, preset);
  });
}

export function formatPageLabel(
  renderer?: Pick<NonNullable<FoliateView["renderer"]>, "page" | "pages"> | null,
  pageItem?: { label?: string },
  location?: { current?: number },
): string {
  const rawPages = renderer?.pages;
  const rawPage = renderer?.page;

  if (
    typeof rawPages === "number" &&
    typeof rawPage === "number" &&
    Number.isFinite(rawPages) &&
    Number.isFinite(rawPage) &&
    rawPages > 2
  ) {
    const totalPages = Math.max(rawPages - 2, 1);
    const currentPage = Math.min(Math.max(rawPage, 1), totalPages);
    return `${currentPage} / ${totalPages}`;
  }

  if (pageItem?.label) {
    return `${pageItem.label}`;
  }

  if (typeof location?.current === "number") {
    return `位置 ${location.current}`;
  }

  return "";
}

export function applyDarkInlineOverrides(
  doc: Document,
  preset: ReaderTheme["preset"],
): void {
  const styleEl = doc.getElementById(
    DARK_OVERRIDES_STYLE_ID,
  ) as HTMLStyleElement | null;

  if (preset !== "dark") {
    styleEl?.remove();
    return;
  }

  const darkPreset = PRESET_STYLES.dark;
  let darkStyleEl = styleEl;
  if (!darkStyleEl) {
    darkStyleEl = doc.createElement("style");
    darkStyleEl.id = DARK_OVERRIDES_STYLE_ID;
    doc.head.appendChild(darkStyleEl);
  }
  darkStyleEl.textContent = `
      * {
        color: ${darkPreset.fg} !important;
      }
      a:link, a:visited {
        color: ${darkPreset.link} !important;
      }
    `;
}
