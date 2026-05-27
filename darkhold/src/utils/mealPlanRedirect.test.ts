import { describe, expect, it, vi } from 'vitest';
import { getCurrentMealPlanWeekPath, getLockedMealPlanWeekPath } from './mealPlanRedirect';

describe('getCurrentMealPlanWeekPath', () => {
  it('returns the current Saturday-based meal-plan week path', () => {
    expect(getCurrentMealPlanWeekPath(new Date('2026-05-27T10:30:00Z'))).toBe(
      '/meal-plan/2026-05-23',
    );
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
});
