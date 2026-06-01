import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiDelete, apiGet, apiPost } from './client';
import {
  createHistoricCookLogs,
  deleteFoods,
  fetchIsSuperuser,
  scanHistoricCookLogs,
  scanOrphanedIngredients,
  scanRecipeCreationDates,
} from './housekeeping';

vi.mock('./client', () => ({ apiGet: vi.fn(), apiPost: vi.fn(), apiDelete: vi.fn() }));

const apiGetMock = vi.mocked(apiGet);
const apiPostMock = vi.mocked(apiPost);
const apiDeleteMock = vi.mocked(apiDelete);
const page = <T>(results: T[]) => ({ count: results.length, next: null, results });

describe('housekeeping API helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('checks the first personal user space for superuser access', async () => {
    apiGetMock.mockResolvedValue([{ user: { is_superuser: true } }]);
    await expect(fetchIsSuperuser()).resolves.toBe(true);
    expect(apiGetMock).toHaveBeenCalledWith('/user-space/all_personal/');
  });

  it('finds foods not referenced by recipe ingredients or shopping-list entries', async () => {
    apiGetMock.mockImplementation(async (path) => {
      if (path === '/food/')
        return page([
          { id: 1, name: 'Used' },
          { id: 2, name: 'Orphan' },
          { id: 3, name: 'Shopping' },
        ]);
      if (path === '/shopping-list-entry/')
        return page([{ id: 10, food: { id: 3, name: 'Shopping' }, checked: false }]);
      if (path === '/recipe/') return page([{ id: 20, name: 'Recipe' }]);
      if (path === '/recipe/20/')
        return {
          id: 20,
          name: 'Recipe',
          steps: [{ id: 30, instruction: '', order: 1, ingredients: [{ id: 40, food: 1 }] }],
        };
      throw new Error(`Unexpected path ${path}`);
    });

    const result = await scanOrphanedIngredients();
    expect(result.foods).toEqual([{ id: 2, name: 'Orphan' }]);
    expect(result.limitation).toContain('recently completed');
  });

  it('deletes foods sequentially and reports update progress', async () => {
    const progress = vi.fn();
    apiDeleteMock.mockResolvedValue(undefined);
    await deleteFoods([5, 6], progress);
    expect(apiDeleteMock.mock.calls).toEqual([[`/food/5/`], [`/food/6/`]]);
    expect(progress).toHaveBeenLastCalledWith({
      completed: 2,
      total: 2,
      label: 'Deleting ingredients',
    });
  });

  it('previews meal plans without matching same-day recipe cook logs', async () => {
    apiGetMock.mockImplementation(async (path) => {
      if (path === '/meal-plan/')
        return page([
          {
            id: 1,
            recipe: { id: 10, name: 'Existing' },
            meal_type: { id: 1, name: 'Dinner', time: '18:30' },
            from_date: '2026-05-01T18:30:00',
          },
          {
            id: 2,
            recipe: { id: 11, name: 'Missing', image: '/media/missing.jpg' },
            meal_type: { id: 1, name: 'Dinner', time: '18:30' },
            from_date: '2026-05-02T18:30:00',
          },
          {
            id: 4,
            recipe: { id: 11, name: 'Missing', image: '/media/missing.jpg' },
            meal_type: { id: 1, name: 'Dinner', time: '18:30' },
            from_date: '2026-05-02T18:30:00',
          },
        ]);
      if (path === '/cook-log/')
        return page([{ id: 3, recipe: 10, created_at: '2026-05-01T18:30:00' }]);
      throw new Error(`Unexpected path ${path}`);
    });

    await expect(
      scanHistoricCookLogs(undefined, new Date('2026-06-01T00:00:00Z')),
    ).resolves.toEqual([
      {
        mealPlanId: 2,
        recipeId: 11,
        recipeName: 'Missing',
        recipeImage: '/media/missing.jpg',
        mealPlanDate: '2026-05-02',
        mealType: { id: 1, name: 'Dinner', time: '18:30' },
      },
    ]);
    expect(apiGetMock).toHaveBeenCalledWith(
      '/meal-plan/',
      expect.objectContaining({ from_date: '1900-01-01', to_date: '2026-05-25' }),
    );
  });

  it('creates historic cook logs with three stars and no notes', async () => {
    apiPostMock.mockResolvedValue({ id: 1, recipe: 11, created_at: '2026-05-02T18:30:00' });
    await createHistoricCookLogs([
      {
        mealPlanId: 2,
        recipeId: 11,
        recipeName: 'Missing',
        mealPlanDate: '2026-05-02',
        mealType: { id: 1, name: 'Dinner', time: '18:30' },
      },
    ]);
    expect(apiPostMock).toHaveBeenCalledWith('/cook-log/', {
      recipe: 11,
      rating: 3,
      comment: null,
      created_at: '2026-05-02T18:30:00',
    });
  });

  it('previews recipe creation dates only when the earliest cook log predates creation', async () => {
    apiGetMock.mockImplementation(async (path) => {
      if (path === '/recipe/')
        return page([
          { id: 1, name: 'Needs correction', created_at: '2026-02-01T12:00:00Z' },
          { id: 2, name: 'Already correct', created_at: '2026-01-01T12:00:00Z' },
        ]);
      if (path === '/cook-log/')
        return page([
          { id: 1, recipe: 1, created_at: '2026-01-10T12:00:00Z' },
          { id: 2, recipe: 1, created_at: '2026-01-05T12:00:00Z' },
          { id: 3, recipe: 2, created_at: '2026-01-10T12:00:00Z' },
        ]);
      throw new Error(`Unexpected path ${path}`);
    });

    await expect(scanRecipeCreationDates()).resolves.toEqual([
      {
        recipeId: 1,
        recipeName: 'Needs correction',
        recipeImage: undefined,
        currentCreatedAt: '2026-02-01T12:00:00Z',
        proposedCreatedAt: '2026-01-05T12:00:00Z',
      },
    ]);
  });
});
