import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recipe } from '../api/tandoor-types';

const { useQueryMock, createMealPlanMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  createMealPlanMock: {
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: useQueryMock,
}));

vi.mock('../hooks/useMealPlan', () => ({
  useCreateMealPlan: () => createMealPlanMock,
}));

import { MealPlanAddModal } from './MealPlanAddModal';

type ReactActGlobal = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

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

    useQueryMock.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
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
});
