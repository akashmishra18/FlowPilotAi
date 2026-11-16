import { useCallback, useEffect, useRef, useState } from 'react';
import { parseApiError } from '@/services/errorHelpers';

interface AsyncDataState<T> {
  data: T | null;
  error: string | null;
  /** HTTP status of the failure (403/404/…), or null for network errors / no error. */
  errorStatus: number | null;
  /** True for any in-flight request, including background reloads. */
  isLoading: boolean;
  /** True only until the first result (or error) arrives — use for skeletons. */
  isInitialLoading: boolean;
  reload: () => Promise<void>;
}

/**
 * Runs `fetcher` on mount and whenever it changes (memoize it with
 * useCallback so its deps describe the query). Stale responses are
 * discarded, so a slow earlier request can never overwrite a newer one.
 * Previous data stays visible during a reload to avoid layout flashes.
 */
export function useAsyncData<T>(fetcher: () => Promise<T>, errorFallback?: string): AsyncDataState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasSettled, setHasSettled] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setIsLoading(true);
    setError(null);
    setErrorStatus(null);
    try {
      const result = await fetcher();
      if (id === requestId.current) setData(result);
    } catch (err) {
      if (id === requestId.current) {
        const parsed = parseApiError(err, errorFallback);
        setError(parsed.message);
        setErrorStatus(parsed.status);
      }
    } finally {
      if (id === requestId.current) {
        setIsLoading(false);
        setHasSettled(true);
      }
    }
  }, [fetcher, errorFallback]);

  // A newer load() supersedes older ones via requestId; setState after unmount is a no-op in React 18.
  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, errorStatus, isLoading, isInitialLoading: !hasSettled, reload: load };
}
