import { API_BASE } from '@/lib/config';

const MAX_MESSAGE_LENGTH = 1000;
const MAX_STACK_LENGTH = 8000;
const MAX_COMPONENT_LENGTH = 300;

interface ClientErrorPayload {
  message: string;
  stack?: string;
  component?: string;
  path?: string;
}

function truncate(value: string | undefined, maximum: number): string | undefined {
  if (!value) return undefined;
  return value.length > maximum ? value.slice(0, maximum) : value;
}

function currentPath(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.location.pathname;
}

// Reports are intentionally best-effort: rendering error handling must never
// introduce another visible error or retain user content in the browser.
export function reportClientError(error: unknown, component?: string) {
  if (typeof window === 'undefined') return;

  const message = error instanceof Error ? error.message : String(error);
  const payload: ClientErrorPayload = {
    message: truncate(message, MAX_MESSAGE_LENGTH) || 'Unknown client error',
    stack: truncate(error instanceof Error ? error.stack : undefined, MAX_STACK_LENGTH),
    component: truncate(component, MAX_COMPONENT_LENGTH),
    path: currentPath(),
  };

  if (process.env.NODE_ENV !== 'production') {
    console.error('[client-error]', error);
  }

  const body = JSON.stringify(payload);
  const endpoint = `${API_BASE}/api/client-errors`;
  void fetch(endpoint, {
    method: 'POST',
    body,
    credentials: 'include',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
  }).catch(() => {
    // The application stays usable when the reporting endpoint is unavailable.
  });
}
