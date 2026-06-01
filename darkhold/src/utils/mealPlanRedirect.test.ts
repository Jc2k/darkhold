import { describe, expect, it, vi } from 'vitest';
import { formatDate } from './dateUtils';
import {
  getCurrentMealPlanWeekPath,
  getMealPlanRedirectWeekQueryOptions,
  getLockedMealPlanWeekPath,
  getMealPlanWeekPathFromDateString,
  getMealPlanWeekStartFromShoppingListEntries,
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

describe('getMealPlanWeekStartFromShoppingListEntries', () => {
  const now = new Date('2026-05-27T10:30:00Z');

  it('returns null when no shopping list exists', () => {
    expect(getMealPlanWeekStartFromShoppingListEntries([], now)).toBeNull();
  });

  it('uses the first dated entry because shopping-list cache entries are newest first', () => {
    const weekStart = getMealPlanWeekStartFromShoppingListEntries(
      [
        { id: 2, list_recipe_data: { meal_plan_data: { from_date: '2026-06-03' } } },
        { id: 1, list_recipe_data: { meal_plan_data: { from_date: '2026-05-20' } } },
      ],
      now,
    );

    expect(formatDate(weekStart!)).toBe('2026-05-30');
  });

  it('falls back to the current week for a shopping list without meal-plan metadata', () => {
    const weekStart = getMealPlanWeekStartFromShoppingListEntries(
      [{ id: 1, list_recipe_data: null }],
      now,
    );

    expect(formatDate(weekStart!)).toBe('2026-05-23');
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

  it('uses from_date from list_recipe_data.meal_plan_data without extra API call', async () => {
    const apiGetMock = vi.fn().mockResolvedValueOnce({
      results: [
        {
          id: 3242,
          list_recipe_data: {
            meal_plan_data: { from_date: '2026-05-31T12:00:00+01:00' },
          },
        },
      ],
    });
    const apiGet = apiGetMock as unknown as <T>(
      path: string,
      params?: Record<string, string | number | boolean | undefined | null>,
    ) => Promise<T>;

    await expect(getLockedMealPlanWeekPath(apiGet, new Date('2026-05-27T10:30:00Z'))).resolves.toBe(
      '/meal-plan/2026-05-30',
    );
    expect(apiGetMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to current week when entries have no meal plan data', async () => {
    const apiGetMock = vi.fn(async () => ({ results: [{ id: 1, list_recipe_data: null }] }));
    const apiGet = apiGetMock as unknown as <T>(
      path: string,
      params?: Record<string, string | number | boolean | undefined | null>,
    ) => Promise<T>;

    await expect(getLockedMealPlanWeekPath(apiGet, new Date('2026-05-27T10:30:00Z'))).resolves.toBe(
      '/meal-plan/2026-05-23',
    );
    expect(apiGetMock).toHaveBeenCalledTimes(1);
  });

  it('skips entries with no from_date and checks later pages', async () => {
    const apiGetMock = vi
      .fn()
      .mockResolvedValueOnce({ results: [{ id: 10, list_recipe_data: null }], next: 'next-page' })
      .mockResolvedValueOnce({
        results: [{ id: 11, list_recipe_data: { meal_plan_data: { from_date: '2026-06-03' } } }],
        next: null,
      });
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
