import { API_BASE } from '@/lib/config';

type ClientErrorSource = 'ErrorBoundary' | 'window.onerror' | 'unhandledrejection';

// Reports carry coarse categories. Error details may include library content.
export function reportClientError(error: unknown, component: ClientErrorSource) {
  if (typeof window === 'undefined') return;

  const path = window.location.pathname;
  let page: string | undefined;
  if (path.startsWith('/read/')) page = '/read/:id';
  else if (path === '/' || path === '/login' || path === '/shelf') page = path;
  const payload = { message: 'Client error', component, path: page };

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
