"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";

export interface ApiData<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

/** Loads data with explicit loading and error states. Re-runs when `deps` change. */
export function useApiData<T>(loader: () => Promise<T>, deps: unknown[] = []): ApiData<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loader());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unexpected error while loading data");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}
