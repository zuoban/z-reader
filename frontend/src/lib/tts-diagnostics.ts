type DiagnosticValue = string | number | boolean | null | undefined;

interface TTSDiagnostic {
  timestamp: string;
  event: string;
  visibility: DocumentVisibilityState;
  detail: Record<string, DiagnosticValue>;
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
    const entries = window.__zReaderTTSDiagnostics ??= [];
    entries.push({ timestamp: new Date().toISOString(), event,
      visibility: document.visibilityState, detail });
    if (entries.length > 200) entries.splice(0, entries.length - 200);
  } catch {
    // Diagnostics must never interfere with playback or private browsing.
  }
}
