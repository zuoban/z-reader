type DiagnosticValue = string | number | boolean | null | undefined;

export interface TTSDiagnostic {
  timestamp: string;
  event: string;
  visibility: DocumentVisibilityState;
  detail: Record<string, DiagnosticValue>;
}

export interface TTSDiagnosticsSummary {
  firstAudioLatencyMs: number[];
  chunkGapMs: number[];
  bufferMissCount: number;
  retryCount: number;
  recoverySuccessCount: number;
  bufferReadySeconds: number[];
}

const NUMERIC_FIELDS = new Set([
  'time', 'duration', 'readyState', 'requestId', 'code', 'latencyMs', 'gapMs',
  'seconds', 'chunks', 'attempt', 'delayMs', 'ssmlBytes', 'bytes', 'averageLatencyMs',
  'estimatedSeconds', 'ratio', 'preloaded', 'queued', 'activePreloads',
]);
const BOOLEAN_FIELDS = new Set(['paused', 'ended', 'replacing', 'continuous']);
const ENUM_FIELDS: Record<string, readonly string[]> = {
  state: ['stopped', 'playing', 'paused'],
  source: ['cache', 'preload', 'network'],
  name: ['NotAllowedError', 'NotSupportedError', 'AbortError', 'TimeoutError',
    'Error', 'TypeError', 'unknown'],
  kind: ['cancelled', 'timeout', 'network', 'rate-limit', 'invalid-ssml',
    'unauthorized', 'permission', 'transient', 'permanent'],
};

function safeDetail(detail: Record<string, DiagnosticValue>): Record<string, DiagnosticValue> {
  return Object.fromEntries(Object.entries(detail).filter(([key, value]) => {
    if (NUMERIC_FIELDS.has(key)) return typeof value === 'number' && Number.isFinite(value);
    if (BOOLEAN_FIELDS.has(key)) return typeof value === 'boolean';
    return typeof value === 'string' && ENUM_FIELDS[key]?.includes(value);
  }));
}

/** Summarize the local ring without copying any event content into the result. */
export function summarizeTTSDiagnostics(
  events: readonly Pick<TTSDiagnostic, 'event' | 'detail'>[],
): TTSDiagnosticsSummary {
  const summary: TTSDiagnosticsSummary = {
    firstAudioLatencyMs: [], chunkGapMs: [], bufferMissCount: 0,
    retryCount: 0, recoverySuccessCount: 0, bufferReadySeconds: [],
  };
  const addSample = (samples: number[], value: DiagnosticValue) => {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) samples.push(value);
  };
  for (const { event, detail } of events) {
    if (event === 'first-audio') addSample(summary.firstAudioLatencyMs, detail.latencyMs);
    if (event === 'chunk-gap') addSample(summary.chunkGapMs, detail.gapMs);
    if (event === 'buffer-miss') summary.bufferMissCount += 1;
    if (event === 'request-retry') summary.retryCount += 1;
    if (event === 'recovery-success') summary.recoverySuccessCount += 1;
    if (event === 'buffer-ready') addSample(summary.bufferReadySeconds, detail.seconds);
  }
  return summary;
}

declare global {
  interface Window {
    __zReaderTTSDiagnostics?: TTSDiagnostic[];
  }
}

/** Opt-in, local-only diagnostics. Never include book text, SSML, tokens, or URLs. */
export function recordTTSDiagnostic(event: string, detail: Record<string, DiagnosticValue> = {}) {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem('z-reader-tts-diagnostics') !== '1') return;
    if (!/^[a-z][a-z0-9.-]{0,63}$/.test(event)) return;
    const entries = window.__zReaderTTSDiagnostics ??= [];
    entries.push({ timestamp: new Date().toISOString(), event,
      visibility: document.visibilityState, detail: safeDetail(detail) });
    if (entries.length > 200) entries.splice(0, entries.length - 200);
  } catch {
    // Diagnostics must never interfere with playback or private browsing.
  }
}
