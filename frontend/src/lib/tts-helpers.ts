import type { TTSSettings } from '@/lib/tts';

export const TTS_SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

export interface TTSSessionSnapshot {
  cfi: string;
  markName?: string;
  markText?: string;
  timestamp: number;
  settings: TTSSettings;
}

export interface TTSVisibleStatus {
  headline: string;
  detail?: string;
  tone?: 'idle' | 'active' | 'warning' | 'error';
}

export type TTSSleepTimerMode = 'off' | 'minutes';

export interface TTSSleepTimer {
  mode: TTSSleepTimerMode;
  minutes?: number;
  endsAt?: number;
  label: string;
}

export function getTTSSessionKey(bookId?: string): string | null {
  return bookId ? `z-reader-tts-session:${bookId}` : null;
}

export function formatRemainingTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '即将结束';

  const rounded = Math.ceil(seconds);
  if (rounded < 60) return `剩余 ${rounded} 秒`;

  const minutes = Math.floor(rounded / 60);
  const restSeconds = rounded % 60;
  return restSeconds > 0 ? `剩余 ${minutes} 分 ${restSeconds} 秒` : `剩余 ${minutes} 分`;
}

export function normalizeMetadataText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeMetadataText(item))
      .filter(Boolean)
      .join(' / ');
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return (
      normalizeMetadataText(record.name) ||
      normalizeMetadataText(record.value) ||
      normalizeMetadataText(record.label) ||
      normalizeMetadataText(record.text)
    );
  }
  return '';
}
