import { beforeEach, describe, expect, it } from 'vitest';
import { recordTTSDiagnostic } from '@/lib/tts-diagnostics';

beforeEach(() => {
  localStorage.clear();
  delete window.__zReaderTTSDiagnostics;
});

describe('local TTS diagnostics', () => {
  it('collects nothing until explicitly enabled', () => {
    recordTTSDiagnostic('audio.ended', { time: 12 });
    expect(window.__zReaderTTSDiagnostics).toBeUndefined();
  });
  it('keeps only a bounded recent history with playback state', () => {
    localStorage.setItem('z-reader-tts-diagnostics', '1');
    for (let i = 0; i < 205; i++) recordTTSDiagnostic('audio.pause', { time: i, paused: true });
    expect(window.__zReaderTTSDiagnostics).toHaveLength(200);
    expect(window.__zReaderTTSDiagnostics?.[0].detail.time).toBe(5);
    expect(window.__zReaderTTSDiagnostics?.at(-1)?.event).toBe('audio.pause');
  });
});
