import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recipe } from '../api/tandoor-types';
import { formatDate } from '../utils/dateUtils';

const { useQueryMock, useUpSoonDataMock, useMealPlanMock, useCookLogMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  useUpSoonDataMock: vi.fn(),
  useMealPlanMock: vi.fn(),
  useCookLogMock: vi.fn(),
}));

type ReactActGlobal = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

vi.mock('@tanstack/react-query', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  return {
    ...actual,
    useQuery: useQueryMock,
  };
});

vi.mock('../hooks/useUpSoon', () => ({
  useUpSoonData: useUpSoonDataMock,
}));

vi.mock('../hooks/useMealPlan', () => ({
  useMealPlan: useMealPlanMock,
}));

vi.mock('../hooks/useCookLog', () => ({
  useCookLog: useCookLogMock,
}));

vi.mock('../components/RecipeCard', () => ({
  RecipeCard: ({ recipe, mealPlanNote }: { recipe: Recipe; mealPlanNote?: string }) => (
    <div className="recipe-card">
      {recipe.name}
      {mealPlanNote && <div className="recipe-card-meal-plan-note">{mealPlanNote}</div>}
    </div>
  ),
}));

vi.mock('../components/MealPlanAddModal', () => ({
  MealPlanAddModal: () => null,
}));

vi.mock('../components/CookLogModal', () => ({
  CookLogModal: () => null,
}));

vi.mock('../components/LoadingMascot', () => ({
  LoadingMascot: () => <div>loading</div>,
}));

import { Dashboard } from './Dashboard';

const upSoonRecipe: Recipe = {
  id: 100,
  name: 'Pasta Bake',
  created_by: 1,
  keywords: [],
  image: null,
  rating: null,
};

describe('Dashboard', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const actGlobal = globalThis as ReactActGlobal;

  beforeEach(() => {
    actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useQueryMock.mockReset();
    useUpSoonDataMock.mockReset();
    useMealPlanMock.mockReset();
    useCookLogMock.mockReset();

    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (
        queryKey[0] === 'recipes' ||
        queryKey[0] === 'meal-plan' ||
        queryKey[0] === 'recently-viewed'
      ) {
        return { data: { results: [] }, isLoading: false, isError: false };
      }

      if (queryKey[0] === 'keywords') {
        return { data: null, isLoading: false, isError: false };
      }

      return { data: undefined, isLoading: false, isError: false };
    });

    useMealPlanMock.mockReturnValue({ data: { results: [] }, isLoading: false, isError: false });
    useCookLogMock.mockReturnValue({ data: {}, isLoading: false, isError: false });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete actGlobal.IS_REACT_ACT_ENVIRONMENT;
  });

  it('includes rice and bowl tag shelves alongside pasta', () => {
    useUpSoonDataMock.mockReturnValue({ data: null, isLoading: false, isError: false });
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === 'keywords' && queryKey[1] === 'by-name') {
        const keywordIds: Record<string, number> = { pasta: 10, rice: 11, bowl: 12 };
        const id = keywordIds[queryKey[2]];
        return { data: id ? { id, name: queryKey[2] } : null, isLoading: false, isError: false };
      }

      if (queryKey[0] === 'recipes' && queryKey[1] === 'tag') {
        return {
          data: {
            results: [
              { id: queryKey[2], name: `${queryKey[2]} recipe`, created_by: 1, keywords: [] },
            ],
          },
          isLoading: false,
          isError: false,
        };
      }

      if (
        queryKey[0] === 'recipes' ||
        queryKey[0] === 'meal-plan' ||
        queryKey[0] === 'recently-viewed'
      ) {
        return { data: { results: [] }, isLoading: false, isError: false };
      }

      if (queryKey[0] === 'keywords') {
        return { data: null, isLoading: false, isError: false };
      }

      return { data: undefined, isLoading: false, isError: false };
    });

    act(() => {
      root.render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain('🍝 Pasta');
    expect(container.textContent).toContain('🍚 Rice');
    expect(container.textContent).toContain('🥣 Bowl');
    expect(container.querySelector('a[href="/search?keywords=11"]')?.textContent).toContain(
      'See all',
    );
    expect(container.querySelector('a[href="/search?keywords=12"]')?.textContent).toContain(
      'See all',
    );
  });

  it('links the Up Soon shelf to the Up Soon book detail page', () => {
    useUpSoonDataMock.mockReturnValue({
      data: {
        bookId: 42,
        entries: [{ entryId: 1, recipeId: upSoonRecipe.id, recipe: upSoonRecipe }],
      },
      isLoading: false,
      isError: false,
    });

    act(() => {
      root.render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain('Up Soon');
    expect(container.querySelector('a[href="/books/42"]')?.textContent).toContain('See all');
  });

  it('links the Recently Added shelf to the created_at-based search', () => {
    useUpSoonDataMock.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
    });
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === 'recipes' && queryKey[1] === 'recent') {
        return {
          data: {
            results: [{ id: 50, name: 'Fresh Soup', created_by: 1, keywords: [], image: null }],
          },
          isLoading: false,
          isError: false,
        };
      }

      if (
        queryKey[0] === 'recipes' ||
        queryKey[0] === 'meal-plan' ||
        queryKey[0] === 'recently-viewed'
      ) {
        return { data: { results: [] }, isLoading: false, isError: false };
      }

      if (queryKey[0] === 'keywords') {
        return { data: null, isLoading: false, isError: false };
      }

      return { data: undefined, isLoading: false, isError: false };
    });

    act(() => {
      root.render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      );
    });

    const recentlyAddedLink = [...container.querySelectorAll('a')].find((link) => {
      const href = link.getAttribute('href');
      return href?.includes('/search?created_at_gte=') && href.includes('sort_order=-created_at');
    });

    expect(recentlyAddedLink?.textContent).toContain('See all');
  });

  it('sorts upcoming meals by meal type time for the same day', () => {
    useUpSoonDataMock.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
    });

    const today = formatDate(new Date());
    useMealPlanMock
      .mockReturnValueOnce({
        data: {
          results: [
            {
              id: 1,
              from_date: today,
              recipe: {
                id: 1,
                name: 'Late Dinner',
                created_by: 1,
                keywords: [],
                image: null,
                rating: null,
              },
              meal_type: { id: 2, name: 'Dinner', time: '18:00', order: 2 },
            },
            {
              id: 2,
              from_date: today,
              recipe: {
                id: 2,
                name: 'Early Breakfast',
                created_by: 1,
                keywords: [],
                image: null,
                rating: null,
              },
              meal_type: { id: 1, name: 'Breakfast', time: '08:00', order: 1 },
            },
          ],
        },
        isLoading: false,
        isError: false,
      })
      .mockReturnValueOnce({ data: { results: [] }, isLoading: false, isError: false });

    act(() => {
      root.render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      );
    });

    const pageText = container.textContent ?? '';
    const breakfastIndex = pageText.indexOf('Early Breakfast');
    const dinnerIndex = pageText.indexOf('Late Dinner');

    expect(breakfastIndex).toBeGreaterThanOrEqual(0);
    expect(dinnerIndex).toBeGreaterThanOrEqual(0);
    expect(breakfastIndex).toBeLessThan(dinnerIndex);
  });

  it('sorts upcoming meals by date, time, order, then id', () => {
    useUpSoonDataMock.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
    });

    const todayDate = new Date();
    const tomorrowDate = new Date(todayDate);
    tomorrowDate.setDate(todayDate.getDate() + 1);
    const today = formatDate(todayDate);
    const tomorrow = formatDate(tomorrowDate);

    useMealPlanMock
      .mockReturnValueOnce({
        data: {
          results: [
            {
              id: 200,
              from_date: tomorrow,
              recipe: {
                id: 200,
                name: 'Tomorrow Breakfast',
                created_by: 1,
                keywords: [],
                image: null,
                rating: null,
              },
              meal_type: { id: 1, name: 'Breakfast', time: '07:00' },
            },
            {
              id: 103,
              from_date: today,
              recipe: {
                id: 103,
                name: 'Today Dinner',
                created_by: 1,
                keywords: [],
                image: null,
                rating: null,
              },
              meal_type: { id: 2, name: 'Dinner', time: '18:00:00', order: 5 },
            },
            {
              id: 102,
              from_date: today,
              recipe: {
                id: 102,
                name: 'Today Breakfast',
                created_by: 1,
                keywords: [],
                image: null,
                rating: null,
              },
              meal_type: { id: 3, name: 'Breakfast', time: '08:00', order: 9 },
            },
            {
              id: 101,
              from_date: today,
              recipe: {
                id: 101,
                name: 'Today Invalid Time Order One',
                created_by: 1,
                keywords: [],
                image: null,
                rating: null,
              },
              meal_type: { id: 4, name: 'Snack', time: 'invalid', order: 1 },
            },
            {
              id: 99,
              from_date: today,
              recipe: {
                id: 99,
                name: 'Today Order Three Low Id',
                created_by: 1,
                keywords: [],
                image: null,
                rating: null,
              },
              meal_type: { id: 5, name: 'Snack', order: 3 },
            },
            {
              id: 100,
              from_date: today,
              recipe: {
                id: 100,
                name: 'Today Order Three High Id',
                created_by: 1,
                keywords: [],
                image: null,
                rating: null,
              },
              meal_type: { id: 6, name: 'Snack', order: 3 },
            },
          ],
        },
        isLoading: false,
        isError: false,
      })
      .mockReturnValueOnce({ data: { results: [] }, isLoading: false, isError: false });

    act(() => {
      root.render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      );
    });

    const pageText = container.textContent ?? '';
    const expectedOrder = [
      'Today Breakfast',
      'Today Dinner',
      'Today Invalid Time Order One',
      'Today Order Three Low Id',
      'Today Order Three High Id',
      'Tomorrow Breakfast',
    ];

    let lastIndex = -1;
    for (const recipeName of expectedOrder) {
      const index = pageText.indexOf(recipeName);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });

  it('shows meal plan notes on upcoming meal cards', () => {
    useUpSoonDataMock.mockReturnValue({ data: null, isLoading: false, isError: false });

    const today = formatDate(new Date());
    useMealPlanMock
      .mockReturnValueOnce({
        data: {
          results: [
            {
              id: 1,
              from_date: today,
              note: 'Use the leftover chicken',
              recipe: {
                id: 1,
                name: 'Chicken Salad',
                created_by: 1,
                keywords: [],
                image: null,
                rating: null,
              },
              meal_type: { id: 1, name: 'Lunch', time: '12:00', order: 1 },
            },
          ],
        },
        isLoading: false,
        isError: false,
      })
      .mockReturnValueOnce({ data: { results: [] }, isLoading: false, isError: false });

    act(() => {
      root.render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      );
    });

    const note = container.querySelector('.recipe-card-meal-plan-note');
    expect(note?.textContent).toContain('Use the leftover chicken');
    expect(note?.closest('.recipe-card')).not.toBeNull();
  });
  it('shows the shopping-list planning week with meal planner and shopping links', () => {
    useUpSoonDataMock.mockReturnValue({ data: null, isLoading: false, isError: false });
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === 'shopping-list') {
        return {
          data: [
            {
              id: 2,
              food: null,
              checked: false,
              list_recipe_data: {
                recipe_data: { name: 'Next dinner' },
                meal_plan_data: { from_date: '2026-05-27' },
              },
            },
            {
              id: 1,
              food: null,
              checked: false,
              list_recipe_data: {
                recipe_data: { name: 'Previous dinner' },
                meal_plan_data: { from_date: '2026-05-20' },
              },
            },
          ],
          isLoading: false,
          isError: false,
        };
      }

      if (
        queryKey[0] === 'recipes' ||
        queryKey[0] === 'meal-plan' ||
        queryKey[0] === 'recently-viewed'
      ) {
        return { data: { results: [] }, isLoading: false, isError: false };
      }

      if (queryKey[0] === 'keywords') {
        return { data: null, isLoading: false, isError: false };
      }

      return { data: undefined, isLoading: false, isError: false };
    });

    act(() => {
      root.render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain(
      'Meal planning in progress for Sat 23 May to Fri 29 May',
    );
    expect(container.querySelector('a[aria-label="Open meal planner"]')?.getAttribute('href')).toBe(
      '/meal-plan/2026-05-23',
    );
    expect(
      container.querySelector('a[aria-label="Open shopping list"]')?.getAttribute('href'),
    ).toBe('/shopping');
  });

  it('does not show a planning alert without shopping-list entries', () => {
    useUpSoonDataMock.mockReturnValue({ data: null, isLoading: false, isError: false });

    act(() => {
      root.render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).not.toContain('Meal planning in progress');
  });

  it('does not show a planning alert for shopping-list entries without meal-plan links', () => {
    useUpSoonDataMock.mockReturnValue({ data: null, isLoading: false, isError: false });
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === 'shopping-list') {
        return {
          data: [
            {
              id: 2,
              food: null,
              checked: false,
              list_recipe_data: null,
            },
            {
              id: 1,
              food: null,
              checked: false,
              list_recipe_data: {
                recipe_data: { name: 'Unlinked dinner' },
                meal_plan_data: null,
              },
            },
          ],
          isLoading: false,
          isError: false,
        };
      }

      if (
        queryKey[0] === 'recipes' ||
        queryKey[0] === 'meal-plan' ||
        queryKey[0] === 'recently-viewed'
      ) {
        return { data: { results: [] }, isLoading: false, isError: false };
      }

      if (queryKey[0] === 'keywords') {
        return { data: null, isLoading: false, isError: false };
      }

      return { data: undefined, isLoading: false, isError: false };
    });

    act(() => {
      root.render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).not.toContain('Meal planning in progress');
  });
});
