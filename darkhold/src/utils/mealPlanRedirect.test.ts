import { describe, expect, it, vi } from 'vitest';
import {
  getCurrentMealPlanWeekPath,
  getMealPlanRedirectWeekQueryOptions,
  getLockedMealPlanWeekPath,
  getMealPlanWeekPathFromDateString,
  invalidateAndRefreshMealPlanRedirectWeek,
  MEAL_PLAN_REDIRECT_WEEK_QUERY_KEY,
  MEAL_PLAN_REDIRECT_WEEK_STALE_TIME,
} from './mealPlanRedirect';

describe('getCurrentMealPlanWeekPath', () => {
  it('returns the current Saturday-based meal-plan week path', () => {
    expect(getCurrentMealPlanWeekPath(new Date('2026-05-27T10:30:00Z'))).toBe(
      '/meal-plan/2026-05-23',
    );
  });
});

describe('getMealPlanWeekPathFromDateString', () => {
  it('normalises date-only meal-plan values to week path', () => {
    expect(getMealPlanWeekPathFromDateString('2026-06-03')).toBe('/meal-plan/2026-05-30');
  });

  it('normalises datetime meal-plan values to week path', () => {
    expect(getMealPlanWeekPathFromDateString('2026-06-03T18:30:00Z')).toBe('/meal-plan/2026-05-30');
  });

  it('returns null for invalid date values', () => {
    expect(getMealPlanWeekPathFromDateString('not-a-date')).toBeNull();
  });
});

describe('getLockedMealPlanWeekPath', () => {
  it('falls back to current week when shopping list has no items', async () => {
    const apiGetMock = vi.fn(async () => ({ results: [] }));
    const apiGet = apiGetMock as unknown as <T>(
      path: string,
      params?: Record<string, string | number | boolean | undefined | null>,
    ) => Promise<T>;

    await expect(getLockedMealPlanWeekPath(apiGet, new Date('2026-05-27T10:30:00Z'))).resolves.toBe(
      '/meal-plan/2026-05-23',
    );
    expect(apiGetMock).toHaveBeenCalledTimes(1);
    expect(apiGetMock).toHaveBeenCalledWith('/shopping-list-entry/', {
      ordering: '-created_at',
      page_size: 100,
      page: 1,
    });
  });

  it('uses the latest shopping item linked meal-plan week when present', async () => {
    const apiGetMock = vi
      .fn()
      .mockResolvedValueOnce({ results: [{ id: 10, recipe_mealplan: 321 }] })
      .mockResolvedValueOnce({ from_date: '2026-06-03' });
    const apiGet = apiGetMock as unknown as <T>(
      path: string,
      params?: Record<string, string | number | boolean | undefined | null>,
    ) => Promise<T>;

    await expect(getLockedMealPlanWeekPath(apiGet, new Date('2026-05-27T10:30:00Z'))).resolves.toBe(
      '/meal-plan/2026-05-30',
    );
    expect(apiGetMock).toHaveBeenNthCalledWith(2, '/meal-plan/321/');
  });

  it('uses meal-plan id from expanded shopping-list objects', async () => {
    const apiGetMock = vi
      .fn()
      .mockResolvedValueOnce({ results: [{ id: 10, recipe_mealplan: { id: 654 } }] })
      .mockResolvedValueOnce({ from_date: '2026-06-10' });
    const apiGet = apiGetMock as unknown as <T>(
      path: string,
      params?: Record<string, string | number | boolean | undefined | null>,
    ) => Promise<T>;

    await expect(getLockedMealPlanWeekPath(apiGet, new Date('2026-05-27T10:30:00Z'))).resolves.toBe(
      '/meal-plan/2026-06-06',
    );
    expect(apiGetMock).toHaveBeenNthCalledWith(2, '/meal-plan/654/');
  });

  it('falls back when shopping entries have no linked meal-plan ids', async () => {
    const apiGetMock = vi.fn(async () => ({ results: [{ id: 1, recipe_mealplan: null }] }));
    const apiGet = apiGetMock as unknown as <T>(
      path: string,
      params?: Record<string, string | number | boolean | undefined | null>,
    ) => Promise<T>;

    await expect(getLockedMealPlanWeekPath(apiGet, new Date('2026-05-27T10:30:00Z'))).resolves.toBe(
      '/meal-plan/2026-05-23',
    );
    expect(apiGetMock).toHaveBeenCalledTimes(1);
  });

  it('falls back when meal-plan entry date is invalid', async () => {
    const apiGetMock = vi
      .fn()
      .mockResolvedValueOnce({ results: [{ id: 10, recipe_mealplan: 321 }] })
      .mockResolvedValueOnce({ from_date: 'not-a-date' });
    const apiGet = apiGetMock as unknown as <T>(
      path: string,
      params?: Record<string, string | number | boolean | undefined | null>,
    ) => Promise<T>;

    await expect(getLockedMealPlanWeekPath(apiGet, new Date('2026-05-27T10:30:00Z'))).resolves.toBe(
      '/meal-plan/2026-05-23',
    );
  });

  it('checks later pages to find the most recent linked meal-plan entry', async () => {
    const apiGetMock = vi
      .fn()
      .mockResolvedValueOnce({ results: [{ id: 10, recipe_mealplan: null }], next: 'next-page' })
      .mockResolvedValueOnce({ results: [{ id: 11, recipe_mealplan: 222 }], next: null })
      .mockResolvedValueOnce({ from_date: '2026-06-03' });
    const apiGet = apiGetMock as unknown as <T>(
      path: string,
      params?: Record<string, string | number | boolean | undefined | null>,
    ) => Promise<T>;

    await expect(getLockedMealPlanWeekPath(apiGet, new Date('2026-05-27T10:30:00Z'))).resolves.toBe(
      '/meal-plan/2026-05-30',
    );
    expect(apiGetMock).toHaveBeenNthCalledWith(1, '/shopping-list-entry/', {
      ordering: '-created_at',
      page_size: 100,
      page: 1,
    });
    expect(apiGetMock).toHaveBeenNthCalledWith(2, '/shopping-list-entry/', {
      ordering: '-created_at',
      page_size: 100,
      page: 2,
    });
  });
});

describe('MEAL_PLAN_REDIRECT_WEEK_QUERY_KEY', () => {
  it('uses a stable query key for redirect week caching', () => {
    expect(MEAL_PLAN_REDIRECT_WEEK_QUERY_KEY).toEqual(['meal-plan', 'redirect-week-path']);
  });
});

describe('getMealPlanRedirectWeekQueryOptions', () => {
  it('defines redirect query options with shared key and cache policy', () => {
    const apiGet = vi.fn();
    const options = getMealPlanRedirectWeekQueryOptions(apiGet);

    expect(options.queryKey).toEqual(MEAL_PLAN_REDIRECT_WEEK_QUERY_KEY);
    expect(options.staleTime).toBe(MEAL_PLAN_REDIRECT_WEEK_STALE_TIME);
    expect(options.retry).toBe(false);
  });
});

describe('invalidateAndRefreshMealPlanRedirectWeek', () => {
  it('invalidates and fetches redirect week using the shared query key', async () => {
    const invalidateQueries = vi.fn();
    const fetchQuery = vi.fn().mockResolvedValue('/meal-plan/2026-05-30');
    const queryClient = { invalidateQueries, fetchQuery };
    const apiGet = vi.fn() as unknown as <T>(
      path: string,
      params?: Record<string, string | number | boolean | undefined | null>,
    ) => Promise<T>;

    await expect(invalidateAndRefreshMealPlanRedirectWeek(queryClient, apiGet)).resolves.toBe(
      '/meal-plan/2026-05-30',
    );

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: MEAL_PLAN_REDIRECT_WEEK_QUERY_KEY,
    });
    expect(fetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: MEAL_PLAN_REDIRECT_WEEK_QUERY_KEY }),
    );
  });
});
