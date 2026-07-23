import type { ReaderTheme } from '@/hooks/useReaderTheme';
import { PRESET_STYLES } from '@/hooks/useReaderTheme';

/** Browser chrome / PWA status bar colors aligned with paper themes */
export const APP_THEME_COLORS = {
  light: '#f5f0e8',
  dark: '#141210',
} as const;

const META_NAME = 'theme-color';
const DYNAMIC_ATTR = 'data-z-reader-theme-color';

/**
 * Set a dynamic theme-color meta (no media query) so the system status bar
 * follows the current app / reader surface. Prefer this over media-based
 * metas while the session is active.
 */
export function applyThemeColor(color: string) {
  if (typeof document === 'undefined') return;

  let meta = document.querySelector<HTMLMetaElement>(
    `meta[name="${META_NAME}"][${DYNAMIC_ATTR}]`
  );

  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', META_NAME);
    meta.setAttribute(DYNAMIC_ATTR, 'true');
    document.head.appendChild(meta);
  }

  meta.setAttribute('content', color);
}

export function clearDynamicThemeColor() {
  if (typeof document === 'undefined') return;
  document
    .querySelectorAll(`meta[name="${META_NAME}"][${DYNAMIC_ATTR}]`)
    .forEach((node) => node.remove());
}

export function themeColorForPreset(preset: ReaderTheme['preset']): string {
  return PRESET_STYLES[preset]?.bg ?? APP_THEME_COLORS.light;
}

export function themeColorForAppMode(isDark: boolean): string {
  return isDark ? APP_THEME_COLORS.dark : APP_THEME_COLORS.light;
}
