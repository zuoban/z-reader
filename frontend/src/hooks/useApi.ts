'use client';

import { useState, useCallback } from 'react';
import {
  API_BASE,
  createAbortController,
  DEFAULT_TIMEOUT,
  normalizeRequestError,
} from '@/lib/config';
import { ApiError, auth, AUTH_EXPIRED_EVENT } from '@/lib/api';

interface UseApiOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  timeout?: number;
}

interface UseApiReturn<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  execute: (path: string, options?: RequestInit) => Promise<T | null>;
  reset: () => void;
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return auth.getToken();
}

function handleUnauthorized(res: Response): void {
  if (res.status !== 401 || typeof window === 'undefined') return;
  auth.removeToken();
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

async function parseApiError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => null) as { error?: string; message?: string } | null;
  const message = body?.message || body?.error || `请求失败，状态码：${res.status}`;
  return new ApiError(message, res.status);
}

export function useApi<T>(defaultOptions?: UseApiOptions<T>): UseApiReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const execute = useCallback(async (path: string, options?: RequestInit): Promise<T | null> => {
    setIsLoading(true);
    setError(null);

    const token = getToken();
    const timeout = options?.signal ? undefined : (defaultOptions?.timeout ?? DEFAULT_TIMEOUT);
    const { controller, timeoutId } = timeout ? createAbortController(timeout) : { controller: new AbortController(), timeoutId: undefined as NodeJS.Timeout | undefined };

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
      ...options?.headers,
    };

    try {
      const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
        signal: controller.signal,
      });

      if (!res.ok) {
        handleUnauthorized(res);
        throw await parseApiError(res);
      }

      const result = await res.json() as T;
      setData(result);
      defaultOptions?.onSuccess?.(result);
      return result;
    } catch (err) {
      const error = normalizeRequestError(err);
      setError(error);
      defaultOptions?.onError?.(error);
      return null;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setIsLoading(false);
    }
  }, [defaultOptions]);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return { data, error, isLoading, execute, reset };
}

export function useApiMutation<T, P = void>(defaultOptions?: UseApiOptions<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const mutate = useCallback(async (path: string, payload?: P, options?: RequestInit): Promise<T | null> => {
    setIsLoading(true);
    setError(null);

    const token = getToken();
    const timeout = defaultOptions?.timeout ?? DEFAULT_TIMEOUT;
    const { controller, timeoutId } = createAbortController(timeout);

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
      ...options?.headers,
    };

    try {
      const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
        body: payload ? JSON.stringify(payload) : options?.body,
        signal: controller.signal,
      });

      if (!res.ok) {
        handleUnauthorized(res);
        throw await parseApiError(res);
      }

      const result = await res.json() as T;
      setData(result);
      defaultOptions?.onSuccess?.(result);
      return result;
    } catch (err) {
      const error = normalizeRequestError(err);
      setError(error);
      defaultOptions?.onError?.(error);
      return null;
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
    }
  }, [defaultOptions]);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return { data, error, isLoading, mutate, reset };
}
