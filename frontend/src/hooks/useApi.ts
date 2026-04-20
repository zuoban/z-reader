'use client';

import { useState, useCallback } from 'react';
import {
  API_BASE,
  createAbortController,
  DEFAULT_TIMEOUT,
  normalizeRequestError,
} from '@/lib/config';

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

export function useApi<T>(defaultOptions?: UseApiOptions<T>): UseApiReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const execute = useCallback(async (path: string, options?: RequestInit): Promise<T | null> => {
    setIsLoading(true);
    setError(null);

    const token = localStorage.getItem('token');
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
        const errData = await res.json().catch(() => ({ message: '未知错误' }));
        throw new Error(errData.message || errData.error || `请求失败，状态码：${res.status}`);
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

    const token = localStorage.getItem('token');
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
        const errData = await res.json().catch(() => ({ message: '未知错误' }));
        throw new Error(errData.message || errData.error || `请求失败，状态码：${res.status}`);
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
