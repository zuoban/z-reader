'use client';

import type { MutableRefObject } from 'react';
import { useEffect } from 'react';
import type { TTSState } from '@/lib/tts';

interface UseTTSForegroundResumeOptions {
  stateRef: MutableRefObject<TTSState>;
  shouldResumeOnForegroundRef: MutableRefObject<boolean>;
  logTTS: (event: string, detail?: Record<string, unknown>) => void;
  attemptResumeAfterInterruption: () => void;
  releaseWakeLock: () => Promise<void>;
}

export function useTTSForegroundResume({
  stateRef,
  shouldResumeOnForegroundRef,
  logTTS,
  attemptResumeAfterInterruption,
  releaseWakeLock,
}: UseTTSForegroundResumeOptions) {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
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
      void releaseWakeLock();
    };

    const handleWindowFocus = () => {
      attemptResumeAfterInterruption();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handleWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handleWindowFocus);
    };
  }, [
    attemptResumeAfterInterruption,
    logTTS,
    releaseWakeLock,
    shouldResumeOnForegroundRef,
    stateRef,
  ]);
}
