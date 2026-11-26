export type TTSStatusTone = 'idle' | 'active' | 'warning' | 'error';

export type { TTSVisibleStatus as TTSStatusInfo, TTSSleepTimer } from '@/lib/tts-helpers';

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
