import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMealPlanningAssistantData } from './useMealPlanningAssistantData';
import type { MealAssistantPrecalculation } from '../utils/mealAssistantPrecalculation';

function page<T>(results: T[]) {
  return {
    count: results.length,
    next: null,
    previous: null,
    results,
  };
}

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function pathnameOf(input: RequestInfo | URL): string {
  return new URL(String(input), window.location.origin).pathname;
}

describe('fetchMealPlanningAssistantData', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the precalculation payload when available', async () => {
    const precalculation: MealAssistantPrecalculation = {
      schemaVersion: 1,
      generatedAt: '2026-06-03T00:00:00.000Z',
      recipes: [{ id: 1, name: 'Chilli', created_by: 1, image: '/recipe.jpg' }],
      keywordNameById: { 10: 'Dinner' },
      produceFoodNames: ['courgette'],
      produceRecipeIds: { courgette: [1] },
      mealHistory: [
        {
          recipeId: 1,
          date: '2026-01-02',
          day: 5,
          weekend: false,
          season: 'winter',
        },
      ],
      recipeInsights: {
        '1': {
          totalCookCount: 1,
          weekdayCookCount: 1,
          weekendCookCount: 0,
          days: {},
          seasons: {},
          produce: ['courgette'],
        },
      },
    };

    vi.mocked(fetch).mockImplementation(async (input) => {
      const pathname = pathnameOf(input);
      if (pathname === '/meal-assistant-precalculation.json') return response(precalculation);
      if (pathname === '/api/recipe-book/') return response(page([]));
      throw new Error(`Unexpected fetch: ${String(input)}`);
    });

    const result = await fetchMealPlanningAssistantData(
      new Date('2026-06-06T00:00:00'),
      new Date('2026-06-12T00:00:00'),
      'Produce',
    );

    expect(result.recipes).toEqual(precalculation.recipes);
    expect(result.keywordNameById).toEqual(precalculation.keywordNameById);
    expect(result.produceFoodNames).toEqual(['courgette']);
    expect(result.precalculation).toBe(precalculation);
    expect(result.historicalMeals).toEqual([
      { id: 1, recipe: 1, meal_type: 0, from_date: '2026-01-02' },
    ]);
  });

  it('does not fallback to historical or produce fan-out when the precalculation is missing', async () => {
    const fetchedPaths: string[] = [];
    vi.mocked(fetch).mockImplementation(async (input) => {
      const pathname = pathnameOf(input);
      fetchedPaths.push(pathname);
      if (pathname === '/meal-assistant-precalculation.json') return response({}, 404);
      if (pathname === '/api/recipe-book/') return response(page([]));
      if (pathname === '/api/recipe/') {
        return response(page([{ id: 1, name: 'Chilli', created_by: 1, image: '/recipe.jpg' }]));
      }
      if (pathname === '/api/keyword/') return response(page([{ id: 10, name: 'Dinner' }]));
      throw new Error(`Unexpected fetch: ${String(input)}`);
    });

    const result = await fetchMealPlanningAssistantData(
      new Date('2026-06-06T00:00:00'),
      new Date('2026-06-12T00:00:00'),
      'Produce',
    );

    expect(result.recipes).toEqual([
      { id: 1, name: 'Chilli', created_by: 1, image: '/recipe.jpg' },
    ]);
    expect(result.keywordNameById).toEqual({ 10: 'Dinner' });
    expect(result.historicalMeals).toEqual([]);
    expect(result.produceFoodNames).toEqual([]);
    expect(result.precalculation).toBeUndefined();
    expect(fetchedPaths).not.toContain('/api/meal-plan/');
    expect(fetchedPaths).not.toContain('/api/supermarket-category/');
    expect(fetchedPaths).not.toContain('/api/food/');
  });
});
