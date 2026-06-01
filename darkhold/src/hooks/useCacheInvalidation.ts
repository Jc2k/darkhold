import { useCallback } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { broadcastInvalidation } from './useInvalidationSocket';

/**
 * Marks local React Query caches stale and tells other connected clients to do
 * the same. Call this after proactively applying a successful mutation result
 * to the local cache so the current view updates immediately while active
 * queries reconcile with the server in the background.
 */
export function invalidateCacheQueries(queryClient: QueryClient, ...queryKeys: string[]): void {
  for (const queryKey of new Set(queryKeys)) {
    void queryClient.invalidateQueries({ queryKey: [queryKey] });
    broadcastInvalidation(queryKey);
  }
}

/** Returns the shared mutation invalidation helper bound to the current query client. */
export function useCacheInvalidation() {
  const queryClient = useQueryClient();
  return useCallback(
    (...queryKeys: string[]) => invalidateCacheQueries(queryClient, ...queryKeys),
    [queryClient],
  );
}
