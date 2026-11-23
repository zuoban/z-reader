'use client';

import type { MutableRefObject } from 'react';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

const TTS_RESUME_TOAST_ID = 'tts-resume-hint';

interface UseTTSResumePromptOptions {
  resumePromptVisible: boolean;
  resumePromptMessage: string;
  isLikelyIOS: boolean;
  requiresExplicitResume: boolean;
  shouldResumeOnForegroundRef: MutableRefObject<boolean>;
  onResumeAttempt: () => void;
}

export function useTTSResumePrompt({
  resumePromptVisible,
  resumePromptMessage,
  isLikelyIOS,
  requiresExplicitResume,
  shouldResumeOnForegroundRef,
  onResumeAttempt,
}: UseTTSResumePromptOptions) {
  const lastToastMessageRef = useRef<string | null>(null);

  useEffect(() => {
    if (!resumePromptVisible || requiresExplicitResume) return;
    const handleGestureResume = () => {
      if (!shouldResumeOnForegroundRef.current) return;
      onResumeAttempt();
    };

    document.addEventListener('touchend', handleGestureResume, { passive: true });
    document.addEventListener('pointerup', handleGestureResume, { passive: true });

    return () => {
      document.removeEventListener('touchend', handleGestureResume);
      document.removeEventListener('pointerup', handleGestureResume);
    };
  }, [onResumeAttempt, requiresExplicitResume, resumePromptVisible, shouldResumeOnForegroundRef]);

  useEffect(() => {
    if (!resumePromptVisible) {
      toast.dismiss(TTS_RESUME_TOAST_ID);
      lastToastMessageRef.current = null;
      return;
    }

    if (lastToastMessageRef.current === resumePromptMessage) return;

    const title = isLikelyIOS && !requiresExplicitResume
      ? '轻触页面后可继续朗读' : '朗读已暂停，可一键恢复';
    toast.message(title, {
      id: TTS_RESUME_TOAST_ID,
      description: resumePromptMessage,
      duration: 3200,
    });
    lastToastMessageRef.current = resumePromptMessage;
  }, [isLikelyIOS, requiresExplicitResume, resumePromptMessage, resumePromptVisible]);

}
