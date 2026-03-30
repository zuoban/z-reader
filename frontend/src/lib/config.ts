export const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export const DEFAULT_TIMEOUT = 30000;

export function createAbortController(timeout: number = DEFAULT_TIMEOUT): {
  controller: AbortController;
  timeoutId: NodeJS.Timeout;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  return { controller, timeoutId };
}