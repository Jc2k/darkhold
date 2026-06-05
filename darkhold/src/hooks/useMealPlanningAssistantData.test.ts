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
      schemaVersion: 7,
      generatedAt: '2026-06-03T00:00:00.000Z',
      keywordNameById: { 10: 'Dinner' },
      recipes: { '1': { id: 1, name: 'Chilli', image: '/recipe.jpg' } },
      recipeFeatures: {
        '1': {
          keywords: ['dinner'],
          produce: ['courgette'],
          weatherTags: ['dry-day'],
          calendarFeatures: ['bob|long'],
          stepCount: 0,
          ingredientLineCount: 0,
          distinctFoodCount: 0,
          complexityScore: 0,
          complexityBucket: 'simple',
          ingredientFoodIds: [],
          ingredientFoodNames: [],
        },
      },
      recipeSimilarities: { '1': [] },
      recipeClusters: {
        'cluster-1': {
          id: 'cluster-1',
          label: 'dinner',
          labelTerms: ['dinner'],
          recipeIds: [1],
          size: 1,
        },
      },
      recipeClusterMemberships: {
        '1': {
          clusterId: 'cluster-1',
          label: 'dinner',
          labelTerms: ['dinner'],
          size: 1,
        },
      },
      relationships: {
        keywords: { dinner: [1] },
        produce: { courgette: [1] },
        weather: { 'dry-day': [1] },
        calendar: { 'bob|long': [1] },
        flags: { 'has-image': [1] },
      },
      recipeHistory: {
        '1': {
          dates: [20455],
          dayCounts: [0, 0, 0, 0, 0, 1, 0],
          seasonCounts: [1, 0, 0, 0],
          totalPlanCount: 1,
          lastPlannedDate: 20455,
        },
      },
      recipeInsights: {
        '1': {
          totalCookCount: 1,
          weekdayCookCount: 1,
          weekendCookCount: 0,
          days: {},
          seasons: {},
          weather: {},
          calendar: {},
          produce: ['courgette'],
        },
      },
      mealTypes: [{ id: 3, name: 'Dinner', planCount: 1 }],
      recipeHistoryByMealType: {
        '3': {
          '1': {
            dates: [20455],
            dayCounts: [0, 0, 0, 0, 0, 1, 0],
            seasonCounts: [1, 0, 0, 0],
            totalPlanCount: 1,
            lastPlannedDate: 20455,
          },
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

    expect(result.recipes).toEqual([
      {
        id: 1,
        name: 'Chilli',
        created_by: 0,
        image: '/recipe.jpg',
        keywords: [{ id: 1, name: 'dinner' }],
        rating: undefined,
        servings: undefined,
        created_at: undefined,
      },
    ]);
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
