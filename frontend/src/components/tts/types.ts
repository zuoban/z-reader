import type { ThemeColors } from '@/hooks/useReaderTheme';

export type TTSStatusTone = 'idle' | 'active' | 'warning' | 'error';

export interface TTSStatusInfo {
  headline: string;
  detail?: string;
  tone?: TTSStatusTone;
}

export interface TTSSleepTimer {
  mode: 'off' | 'minutes';
  minutes?: number;
  endsAt?: number;
  label: string;
}

export interface TTSPosition {
  x: number;
  y: number;
}

export const FAB_SIZE = 52;
export const FLOATING_IDLE_DOCK_DELAY_MS = 3600;
export const FLOATING_DOCK_RIGHT = 0;
export const FLOATING_VIEWPORT_MARGIN = 12;
export const FLOATING_PANEL_FOOTER_PADDING = 12;

export const RATE_OPTIONS = [
  { label: '1倍', value: 0 },
  { label: '1.25倍', value: 25 },
  { label: '1.5倍', value: 50 },
  { label: '1.75倍', value: 75 },
  { label: '2倍', value: 100 },
] as const;

export const HIGHLIGHT_MODE_OPTIONS = [
  ['word', '词语'],
  ['sentence', '句子'],
] as const;

export const SLEEP_TIMER_MINUTES = [15, 30, 60] as const;

export function getTriggerSurface(uiScheme: ThemeColors, active: boolean) {
  return {
    background: uiScheme.cardBg,
    border: `1px solid ${active ? uiScheme.link : uiScheme.cardBorder}`,
    boxShadow: 'var(--paper-shadow-control)',
  };
}

export function getStatusColor(tone: TTSStatusTone): string {
  switch (tone) {
    case 'error':
      return 'var(--reader-panel-danger)';
    case 'warning':
      return 'var(--reader-panel-warning)';
    case 'active':
      return 'var(--reader-panel-accent)';
    default:
      return 'var(--reader-panel-muted)';
  }
}
