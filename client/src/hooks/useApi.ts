import { useState, useCallback, useRef } from 'react';
import { apiClient } from '@/api/axios';
import { ApiResponse, ApiError } from '@/types/api';

interface UseApiState<T> {
  data: T | null;
  error: ApiError | null;
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  isIdle: boolean;
}

interface UseApiOptions<T, TArgs extends unknown[]> {
  onSuccess?: (data: T, ...args: TArgs) => void;
  onError?: (error: ApiError, ...args: TArgs) => void;
  onSettled?: (data: T | undefined, error: ApiError | null, ...args: TArgs) => void;
  immediate?: boolean;
  retry?: number;
  retryDelay?: number;
}

interface UseApiReturn<T, TArgs extends unknown[]> {
  execute: (...args: TArgs) => Promise<ApiResponse<T> | undefined>;
  data: T | null;
  error: ApiError | null;
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  isIdle: boolean;
  reset: () => void;
  setData: (data: T | null) => void;
  setError: (error: ApiError | null) => void;
}

export function useApi<T = unknown, TArgs extends unknown[] = unknown[]>(
  apiFn: (...args: TArgs) => Promise<ApiResponse<T>>,
  options: UseApiOptions<T, TArgs> = {}
): UseApiReturn<T, TArgs> {
  const {
    onSuccess,
    onError,
    onSettled,
    retry = 0,
    retryDelay = 1000,
  } = options;

  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    error: null,
    isLoading: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
  });

  const retryCountRef = useRef(0);
  const isMountedRef = useRef(true);

  const reset = useCallback(() => {
    setState({
      data: null,
      error: null,
      isLoading: false,
      isError: false,
      isSuccess: false,
      isIdle: true,
    });
    retryCountRef.current = 0;
  }, []);

  const setData = useCallback((data: T | null) => {
    setState((prev) => ({
      ...prev,
      data,
      isSuccess: data !== null,
      isError: false,
      isIdle: false,
    }));
  }, []);

  const setError = useCallback((error: ApiError | null) => {
    setState((prev) => ({
      ...prev,
      error,
      isError: error !== null,
      isSuccess: false,
      isIdle: false,
    }));
  }, []);

  const execute = useCallback(
    async (...args: TArgs): Promise<ApiResponse<T> | undefined> => {
      if (!isMountedRef.current) return;

      setState((prev) => ({
        ...prev,
        isLoading: true,
        isError: false,
        isSuccess: false,
        isIdle: false,
      }));

      try {
        const response = await apiFn(...args);

        if (!isMountedRef.current) return response;

        if (response.success && response.data) {
          setState((prev) => ({
            ...prev,
            data: response.data,
            error: null,
            isLoading: false,
            isError: false,
            isSuccess: true,
            isIdle: false,
          }));
          onSuccess?.(response.data, ...args);
          onSettled?.(response.data, null, ...args);
          retryCountRef.current = 0;
          return response;
        } else {
          const error: ApiError = {
            success: false,
            message: response.message || 'An error occurred',
            statusCode: 0,
          };
          setState((prev) => ({
            ...prev,
            error,
            isLoading: false,
            isError: true,
            isSuccess: false,
            isIdle: false,
          }));
          onError?.(error, ...args);
          onSettled?.(undefined, error, ...args);

          if (retryCountRef.current < retry) {
            retryCountRef.current++;
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
            return execute(...args);
          }

          return response;
        }
      } catch (err) {
        if (!isMountedRef.current) return;

        const error: ApiError = {
          success: false,
          message: err instanceof Error ? err.message : 'An unexpected error occurred',
          statusCode: 0,
        };

        setState((prev) => ({
          ...prev,
          error,
          isLoading: false,
          isError: true,
          isSuccess: false,
          isIdle: false,
        }));

        onError?.(error, ...args);
        onSettled?.(undefined, error, ...args);

        if (retryCountRef.current < retry) {
          retryCountRef.current++;
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          return execute(...args);
        }

        return undefined;
      }
    },
    [apiFn, onSuccess, onError, onSettled, retry, retryDelay]
  );

  return {
    execute,
    data: state.data,
    error: state.error,
    isLoading: state.isLoading,
    isError: state.isError,
    isSuccess: state.isSuccess,
    isIdle: state.isIdle,
    reset,
    setData,
    setError,
  };
}

export function useGet<T = unknown>(
  url: string,
  options: Omit<UseApiOptions<T, []>, 'immediate'> & { params?: Record<string, unknown> } = {}
): UseApiReturn<T, []> {
  return useApi(
    () => apiClient.get<ApiResponse<T>>(url, { params: options.params }),
    options
  );
}

export function usePost<T = unknown, TBody extends object = object>(
  url: string,
  options: Omit<UseApiOptions<T, [TBody]>, 'immediate'> = {}
): UseApiReturn<T, [TBody]> {
  return useApi(
    (body: TBody) => apiClient.post<ApiResponse<T>>(url, body),
    options
  );
}

export function usePut<T = unknown, TBody extends object = object>(
  url: string,
  options: Omit<UseApiOptions<T, [TBody]>, 'immediate'> = {}
): UseApiReturn<T, [TBody]> {
  return useApi(
    (body: TBody) => apiClient.put<ApiResponse<T>>(url, body),
    options
  );
}

export function usePatch<T = unknown, TBody extends object = object>(
  url: string,
  options: Omit<UseApiOptions<T, [TBody]>, 'immediate'> = {}
): UseApiReturn<T, [TBody]> {
  return useApi(
    (body: TBody) => apiClient.patch<ApiResponse<T>>(url, body),
    options
  );
}

export function useDelete<T = unknown>(
  url: string,
  options: Omit<UseApiOptions<T, []>, 'immediate'> = {}
): UseApiReturn<T, []> {
  return useApi(
    () => apiClient.delete<ApiResponse<T>>(url),
    options
  );
}

export default useApi;