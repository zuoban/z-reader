'use client';

import { Toaster } from 'sonner';
import '@/app/styles/toaster.css';

export function AppToaster() {
  return (
    <Toaster
      position="top-center"
      closeButton
      containerAriaLabel="应用通知"
      offset={{ top: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
      mobileOffset={{
        top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
        left: 'max(1rem, env(safe-area-inset-left, 0px))',
        right: 'max(1rem, env(safe-area-inset-right, 0px))',
      }}
      toastOptions={{
        closeButtonAriaLabel: '关闭通知',
        style: {
          background: 'color-mix(in srgb, var(--toast-bg) 92%, transparent)',
          color: 'var(--toast-fg)',
          border: '1px solid var(--toast-border)',
          borderRadius: 'var(--radius-xl)',
          paddingRight: '3.25rem',
          boxShadow: 'var(--paper-shadow-floating), inset 0 1px 0 var(--paper-highlight-top)',
        },
      }}
    />
  );
}
