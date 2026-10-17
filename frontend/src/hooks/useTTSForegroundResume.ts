'use client';

import type { MutableRefObject } from 'react';
import { useEffect } from 'react';
import type { TTSState } from '@/lib/tts';
import { recordTTSDiagnostic } from '@/lib/tts-diagnostics';

interface UseTTSForegroundResumeOptions {
  stateRef: MutableRefObject<TTSState>;
  shouldResumeOnForegroundRef: MutableRefObject<boolean>;
  logTTS: (event: string, detail?: Record<string, unknown>) => void;
  attemptResumeAfterInterruption: () => void;
  releaseWakeLock: () => Promise<void>;
  saveSession?: () => void;
}

export function useTTSForegroundResume({
  stateRef,
  shouldResumeOnForegroundRef,
  logTTS,
  attemptResumeAfterInterruption,
  releaseWakeLock,
  saveSession,
}: UseTTSForegroundResumeOptions) {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      recordTTSDiagnostic('visibility-change', { state: stateRef.current });
      logTTS('visibility-change', {
        state: document.visibilityState,
        ttsState: stateRef.current,
      });

      if (document.visibilityState === 'visible') {
        attemptResumeAfterInterruption();
        return;
      }

      if (stateRef.current === 'playing') {
        shouldResumeOnForegroundRef.current = true;
      }
      saveSession?.();
      void releaseWakeLock();
    };

    const handleWindowFocus = () => {
      attemptResumeAfterInterruption();
    };
    const handleFreeze = () => {
      recordTTSDiagnostic('page-freeze', { state: stateRef.current });
      saveSession?.();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handleWindowFocus);
    document.addEventListener('freeze', handleFreeze);
    document.addEventListener('resume', handleWindowFocus);
    window.addEventListener('pagehide', handleFreeze);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handleWindowFocus);
      document.removeEventListener('freeze', handleFreeze);
      document.removeEventListener('resume', handleWindowFocus);
      window.removeEventListener('pagehide', handleFreeze);
    };
  }, [
    attemptResumeAfterInterruption,
    logTTS,
    releaseWakeLock,
    shouldResumeOnForegroundRef,
    stateRef,
    saveSession,
  ]);
}
