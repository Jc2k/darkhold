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
  RecipeCard: ({ recipe }: { recipe: Recipe }) => <div>{recipe.name}</div>,
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
});
