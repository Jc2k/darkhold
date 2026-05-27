import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recipe } from '../api/tandoor-types';

const { useQueryMock, useQueryClientMock, fetchQueryMock, createMealPlanMock, apiGetMock } =
  vi.hoisted(() => ({
    useQueryMock: vi.fn(),
    useQueryClientMock: vi.fn(),
    fetchQueryMock: vi.fn(),
    createMealPlanMock: {
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    },
    apiGetMock: vi.fn(),
  }));

vi.mock('@tanstack/react-query', () => ({
  useQuery: useQueryMock,
  useQueryClient: useQueryClientMock,
}));

vi.mock('../hooks/useMealPlan', () => ({
  useCreateMealPlan: () => createMealPlanMock,
}));

vi.mock('../api/client', () => ({
  apiGet: apiGetMock,
}));

import { MealPlanAddModal, fetchKeywordNameById } from './MealPlanAddModal';

type ReactActGlobal = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
type QueryOptionsLike = { queryKey: readonly unknown[] };

describe('MealPlanAddModal', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const actGlobal = globalThis as ReactActGlobal;

  beforeEach(() => {
    actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.setItem('tandoor_token', 'test-token');

    useQueryMock.mockImplementation(({ queryKey }: QueryOptionsLike) => {
      if (queryKey[0] === 'recipe') {
        return { data: { id: 1, steps: [] } };
      }
      if (queryKey[0] === 'meal-types') {
        return {
          data: {
            results: [
              { id: 1, name: 'Breakfast' },
              { id: 2, name: 'Dinner' },
            ],
          },
        };
      }
      if (queryKey[0] === 'keyword-name-by-id') {
        return { data: { 10: 'Breakfast' } };
      }
      return { data: undefined };
    });
    useQueryClientMock.mockReturnValue({
      fetchQuery: fetchQueryMock,
    });
    fetchQueryMock.mockImplementation(({ queryKey }: QueryOptionsLike) => {
      if (queryKey[0] === 'meal-types') {
        return Promise.resolve({
          results: [
            { id: 1, name: 'Breakfast' },
            { id: 2, name: 'Dinner' },
          ],
        });
      }
      if (queryKey[0] === 'keyword-name-by-id') {
        return Promise.resolve({ 10: 'Breakfast' });
      }
      return Promise.resolve(undefined);
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    localStorage.clear();
    delete actGlobal.IS_REACT_ACT_ENVIRONMENT;
    vi.clearAllMocks();
  });

  it('uses fetched keyword names to map id-only breakfast tags to breakfast meal type', async () => {
    const recipe = { id: 1, name: 'Eggs', servings: 2, keywords: [10] } as unknown as Recipe;
    const onHide = vi.fn();

    act(() => {
      root.render(
        <MemoryRouter>
          <MealPlanAddModal recipe={recipe} onHide={onHide} />
        </MemoryRouter>,
      );
    });

    const addButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Add to Plan',
    );
    expect(addButton).toBeTruthy();

    await act(async () => {
      addButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(createMealPlanMock.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        recipe: 1,
        meal_type: 1,
      }),
    );
    expect(onHide).toHaveBeenCalled();
  });

  it('fetches all keyword pages into an id-to-name map', async () => {
    apiGetMock
      .mockResolvedValueOnce({
        results: [{ id: 10, name: 'Breakfast' }],
        next: '/keyword/?page=2',
      })
      .mockResolvedValueOnce({
        results: [{ id: 11, name: 'Lunch' }],
        next: null,
      });

    const result = await fetchKeywordNameById();

    expect(apiGetMock).toHaveBeenNthCalledWith(1, '/keyword/', { page_size: 100, page: 1 });
    expect(apiGetMock).toHaveBeenNthCalledWith(2, '/keyword/', { page_size: 100, page: 2 });
    expect(result).toEqual({ 10: 'Breakfast', 11: 'Lunch' });
  });

  it('waits for unresolved keyword lookup on submit and then adds to plan', async () => {
    useQueryMock.mockImplementation(({ queryKey }: QueryOptionsLike) => {
      if (queryKey[0] === 'recipe') {
        return { data: { id: 1, steps: [] } };
      }
      if (queryKey[0] === 'meal-types') {
        return {
          data: undefined,
          isPending: true,
          isFetching: true,
        };
      }
      if (queryKey[0] === 'keyword-name-by-id') {
        return {
          data: undefined,
          isPending: true,
          isFetching: true,
        };
      }
      return { data: undefined };
    });

    const recipe = { id: 1, name: 'Eggs', servings: 2, keywords: [10] } as unknown as Recipe;

    act(() => {
      root.render(
        <MemoryRouter>
          <MealPlanAddModal recipe={recipe} onHide={vi.fn()} />
        </MemoryRouter>,
      );
    });

    const addButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Add to Plan',
    ) as HTMLButtonElement;

    expect(addButton).toBeTruthy();
    expect(addButton.disabled).toBe(false);

    await act(async () => {
      addButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(fetchQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['meal-types'],
      }),
    );
    expect(fetchQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['keyword-name-by-id'],
      }),
    );
    expect(createMealPlanMock.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        recipe: 1,
        meal_type: 1,
      }),
    );
  });
});
