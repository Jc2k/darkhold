import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiGetMock, useInfiniteQueryMock } = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  useInfiniteQueryMock: vi.fn(),
}));

vi.mock('../api/client', () => ({
  apiGet: apiGetMock,
}));

vi.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: useInfiniteQueryMock,
}));

import { useRecipeSearch } from './useRecipeSearch';

describe('useRecipeSearch', () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    useInfiniteQueryMock.mockReset();
    useInfiniteQueryMock.mockImplementation((options) => options);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('translates new=true into a created_at_gte query with newest-first sorting', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-26T14:15:00Z'));

    const query = useRecipeSearch({ new: true });

    await query.queryFn({ pageParam: 2 });

    expect(apiGetMock).toHaveBeenCalledWith('/recipe/', {
      created_at_gte: '2026-04-26',
      sort_order: '-created_at',
      page: 2,
    });
  });

  it('lets an explicit sort_order override the default recently-added sort', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-26T14:15:00Z'));

    const query = useRecipeSearch({ new: true, sort_order: '-id' });

    await query.queryFn({ pageParam: 1 });

    expect(apiGetMock).toHaveBeenCalledWith('/recipe/', {
      created_at_gte: '2026-04-26',
      sort_order: '-id',
      page: 1,
    });
  });
});
