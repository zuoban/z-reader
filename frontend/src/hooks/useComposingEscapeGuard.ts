'use client';

import { useEffect } from 'react';

/** Prevents Escape during IME composition from bubbling out to close the active overlay. */
export function useComposingEscapeGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;

    function handleComposingEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && event.isComposing) {
        event.stopPropagation();
      }
    }

    window.addEventListener('keydown', handleComposingEscape, true);
    return () => window.removeEventListener('keydown', handleComposingEscape, true);
  }, [active]);
}
