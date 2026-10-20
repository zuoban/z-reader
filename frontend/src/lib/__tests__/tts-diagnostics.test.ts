import { beforeEach, describe, expect, it } from 'vitest';
import { recordTTSDiagnostic, summarizeTTSDiagnostics } from '@/lib/tts-diagnostics';

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

  it('summarizes latency and buffer metrics without mutating the event history', () => {
    const summarize = summarizeTTSDiagnostics;
    expect(summarize).toBeTypeOf('function');
    const events = [
      { event: 'first-audio', detail: { latencyMs: 350 } },
      { event: 'first-audio', detail: { latencyMs: 175 } },
      { event: 'chunk-gap', detail: { gapMs: 22 } },
      { event: 'buffer-miss', detail: {} },
      { event: 'buffer-miss', detail: {} },
      { event: 'request-retry', detail: { attempt: 1, delayMs: 500, kind: 'network' } },
      { event: 'request-retry', detail: { attempt: 2, delayMs: 1000, kind: 'timeout' } },
      { event: 'recovery-success', detail: {} },
      { event: 'buffer-ready', detail: { seconds: 14.5, chunks: 2 } },
      { event: 'buffer-ready', detail: { seconds: 30, chunks: 4 } },
      { event: 'audio.pause', detail: { time: 3 } },
    ];
    const original = JSON.stringify(events);
    expect(summarize(events)).toEqual({
      firstAudioLatencyMs: [350, 175], chunkGapMs: [22], bufferMissCount: 2,
      retryCount: 2, recoverySuccessCount: 1, bufferReadySeconds: [14.5, 30],
    });
    expect(JSON.stringify(events)).toBe(original);
  });

  it('ignores malformed timing samples and returns empty aggregates for no events', () => {
    const summarize = summarizeTTSDiagnostics;
    expect(summarize).toBeTypeOf('function');
    expect(summarize([
      { event: 'first-audio', detail: { latencyMs: -5 } },
      { event: 'first-audio', detail: { latencyMs: Infinity } },
      { event: 'chunk-gap', detail: { gapMs: '20' } },
      { event: 'buffer-ready', detail: { seconds: NaN } },
    ])).toEqual(summarize([]));
  });

  it('drops unknown and sensitive detail fields rather than retaining caller content', () => {
    localStorage.setItem('z-reader-tts-diagnostics', '1');
    recordTTSDiagnostic('request-retry', {
      attempt: 1, delayMs: 500, kind: 'network', text: 'private book text',
      ssml: '<speak>private</speak>', token: 'secret', url: 'https://private',
      unexpected: 'private content',
    });
    expect(window.__zReaderTTSDiagnostics?.[0].detail).toEqual({
      attempt: 1, delayMs: 500, kind: 'network',
    });
  });
});
