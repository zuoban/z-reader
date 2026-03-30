'use client';

import { useEffect, useCallback } from 'react';

type KeyHandler = () => void;

interface KeyBindings {
  onPrev?: KeyHandler;
  onNext?: KeyHandler;
  onEscape?: KeyHandler;
  customBindings?: Record<string, KeyHandler>;
}

export function useKeyboardShortcuts(bindings: KeyBindings) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (e.key) {
      case 'ArrowLeft':
      case 'PageUp':
      case 'k':
      case 'K':
        bindings.onPrev?.();
        break;
      case 'ArrowRight':
      case 'PageDown':
      case 'j':
      case 'J':
        bindings.onNext?.();
        break;
      case ' ':
        if (e.shiftKey) {
          bindings.onPrev?.();
        } else {
          bindings.onNext?.();
        }
        break;
      case 'Escape':
        bindings.onEscape?.();
        break;
      default:
        if (bindings.customBindings && bindings.customBindings[e.key]) {
          bindings.customBindings[e.key]();
        }
    }
  }, [bindings]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { handleKeyDown };
}