import { useCallback, useEffect, useRef, useState } from "react";

export type ApiDataState<T> = {
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => Promise<void>;
};

/**
 * Minimal page-data hook: runs `load` on mount and whenever `deps` change,
 * ignoring out-of-order resolutions from stale requests.
 */
export const useApiData = <T,>(load: () => Promise<T>, deps: readonly unknown[]): ApiDataState<T> => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const requestSeq = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const run = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const result = await loadRef.current();
      if (seq === requestSeq.current) {
        setData(result);
      }
    } catch (caught) {
      if (seq === requestSeq.current) {
        setError(caught);
        setData(null);
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload: run };
};
