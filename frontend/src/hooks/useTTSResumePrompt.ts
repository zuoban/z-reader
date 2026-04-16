'use client';

import type { MutableRefObject } from 'react';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

const TTS_RESUME_TOAST_ID = 'tts-resume-hint';

interface UseTTSResumePromptOptions {
  resumePromptVisible: boolean;
  resumePromptMessage: string;
  isLikelyIOS: boolean;
  shouldResumeOnForegroundRef: MutableRefObject<boolean>;
  onResumeAttempt: () => void;
}

export function useTTSResumePrompt({
  resumePromptVisible,
  resumePromptMessage,
  isLikelyIOS,
  shouldResumeOnForegroundRef,
  onResumeAttempt,
}: UseTTSResumePromptOptions) {
  const hasShownResumeToastRef = useRef(false);

  useEffect(() => {
    const handleGestureResume = () => {
      if (!resumePromptVisible || !shouldResumeOnForegroundRef.current) return;
      onResumeAttempt();
    };

    document.addEventListener('touchend', handleGestureResume, { passive: true });
    document.addEventListener('pointerup', handleGestureResume, { passive: true });

    return () => {
      document.removeEventListener('touchend', handleGestureResume);
      document.removeEventListener('pointerup', handleGestureResume);
    };
  }, [onResumeAttempt, resumePromptVisible, shouldResumeOnForegroundRef]);

  useEffect(() => {
    if (!resumePromptVisible) {
      toast.dismiss(TTS_RESUME_TOAST_ID);
      hasShownResumeToastRef.current = false;
      return;
    }

    if (hasShownResumeToastRef.current) return;

    toast.message(isLikelyIOS ? '轻触页面后可继续朗读' : '朗读已暂停，可一键恢复', {
      id: TTS_RESUME_TOAST_ID,
      description: resumePromptMessage,
      duration: 3200,
    });
    hasShownResumeToastRef.current = true;
  }, [isLikelyIOS, resumePromptMessage, resumePromptVisible]);

}
