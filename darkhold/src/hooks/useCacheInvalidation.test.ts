import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidateCacheQueries } from './useCacheInvalidation';

const { broadcastInvalidationMock } = vi.hoisted(() => ({
  broadcastInvalidationMock: vi.fn(),
}));

vi.mock('./useInvalidationSocket', () => ({
  broadcastInvalidation: broadcastInvalidationMock,
}));

describe('invalidateCacheQueries', () => {
  beforeEach(() => {
    broadcastInvalidationMock.mockReset();
  });

  it('marks each local cache stale and broadcasts each invalidation once', () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    invalidateCacheQueries(queryClient, 'meal-plan', 'shopping-list', 'meal-plan');

    expect(invalidateSpy).toHaveBeenCalledTimes(2);
    expect(invalidateSpy).toHaveBeenNthCalledWith(1, { queryKey: ['meal-plan'] });
    expect(invalidateSpy).toHaveBeenNthCalledWith(2, { queryKey: ['shopping-list'] });
    expect(broadcastInvalidationMock).toHaveBeenCalledTimes(2);
    expect(broadcastInvalidationMock).toHaveBeenNthCalledWith(1, 'meal-plan');
    expect(broadcastInvalidationMock).toHaveBeenNthCalledWith(2, 'shopping-list');
  });
});
