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
    const apiGet = vi.fn(async () => ({ results: [] }));

    await expect(getLockedMealPlanWeekPath(apiGet, new Date('2026-05-27T10:30:00Z'))).resolves.toBe(
      '/meal-plan/2026-05-23',
    );
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet).toHaveBeenCalledWith('/shopping-list-entry/', {
      ordering: '-created_at',
      page_size: 100,
    });
  });

  it('uses the latest shopping item linked meal-plan week when present', async () => {
    const apiGet = vi
      .fn()
      .mockResolvedValueOnce({ results: [{ id: 10, recipe_mealplan: 321 }] })
      .mockResolvedValueOnce({ from_date: '2026-06-03' });

    await expect(getLockedMealPlanWeekPath(apiGet, new Date('2026-05-27T10:30:00Z'))).resolves.toBe(
      '/meal-plan/2026-05-30',
    );
    expect(apiGet).toHaveBeenNthCalledWith(2, '/meal-plan/321/');
  });

  it('falls back when shopping entries have no linked meal-plan ids', async () => {
    const apiGet = vi.fn(async () => ({ results: [{ id: 1, recipe_mealplan: null }] }));

    await expect(getLockedMealPlanWeekPath(apiGet, new Date('2026-05-27T10:30:00Z'))).resolves.toBe(
      '/meal-plan/2026-05-23',
    );
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it('falls back when meal-plan entry date is invalid', async () => {
    const apiGet = vi
      .fn()
      .mockResolvedValueOnce({ results: [{ id: 10, recipe_mealplan: 321 }] })
      .mockResolvedValueOnce({ from_date: 'not-a-date' });

    await expect(getLockedMealPlanWeekPath(apiGet, new Date('2026-05-27T10:30:00Z'))).resolves.toBe(
      '/meal-plan/2026-05-23',
    );
  });
});
