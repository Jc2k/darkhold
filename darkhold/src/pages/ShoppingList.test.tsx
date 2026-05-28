import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Food } from '../api/tandoor-types';

const { useQueryMock, useMutationMock, useQueryClientMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  useMutationMock: vi.fn(),
  useQueryClientMock: vi.fn(),
}));

type ReactActGlobal = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

vi.mock('@tanstack/react-query', () => ({
  useQuery: useQueryMock,
  useMutation: useMutationMock,
  useQueryClient: useQueryClientMock,
}));

vi.mock('../api/client', () => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));

vi.mock('../hooks/useInvalidationSocket', () => ({
  broadcastInvalidation: vi.fn(),
}));

vi.mock('../components/LoadingMascot', () => ({
  LoadingMascot: () => <div>loading</div>,
}));

vi.mock('../components/NoTokenAlert', () => ({
  NoTokenAlert: () => <div>no-token</div>,
}));

import { apiGet } from '../api/client';
import { ShoppingList, fetchAllShoppingListEntries } from './ShoppingList';

function makeFood(): Food {
  return {
    id: 1,
    name: 'Flour',
    supermarket_category: { id: 5, name: 'Baking' },
  };
}

describe('ShoppingList', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const actGlobal = globalThis as ReactActGlobal;

  beforeEach(() => {
    actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useQueryClientMock.mockReturnValue({ invalidateQueries: vi.fn() });
    useMutationMock.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) });
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === 'shopping-list') {
        return {
          data: [
            {
              id: 11,
              amount: 1,
              unit_name: 'cup',
              food: makeFood(),
              checked: true,
              list_recipe_data: { recipe_data: { name: 'Cake' } },
            },
            {
              id: 22,
              amount: 2,
              unit_name: 'cup',
              food: makeFood(),
              checked: false,
              list_recipe_data: { recipe_data: { name: 'Bread' } },
            },
          ],
          isLoading: false,
          isError: false,
        };
      }
      // meal plan query
      return { data: [], isLoading: false, isError: false };
    });

    localStorage.setItem('tandoor_token', 'test-token');
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

  it('fetches all shopping list pages', async () => {
    const apiGetMock = vi.mocked(apiGet);
    apiGetMock
      .mockResolvedValueOnce({
        count: 2,
        next: '/api/shopping-list-entry/?page=2',
        results: [{ id: 1, food: makeFood(), checked: false }],
      })
      .mockResolvedValueOnce({
        count: 2,
        next: null,
        results: [{ id: 2, food: { ...makeFood(), id: 2, name: 'Milk' }, checked: true }],
      });

    const result = await fetchAllShoppingListEntries();

    expect(result).toEqual([
      { id: 1, food: makeFood(), checked: false },
      { id: 2, food: { ...makeFood(), id: 2, name: 'Milk' }, checked: true },
    ]);
    expect(apiGetMock).toHaveBeenNthCalledWith(1, '/shopping-list-entry/', {
      page_size: 100,
      page: 1,
    });
    expect(apiGetMock).toHaveBeenNthCalledWith(2, '/shopping-list-entry/', {
      page_size: 100,
      page: 2,
    });
  });

  it('propagates errors while fetching shopping list pages', async () => {
    const apiGetMock = vi.mocked(apiGet);
    apiGetMock.mockRejectedValueOnce(new Error('API error 500'));

    await expect(fetchAllShoppingListEntries()).rejects.toThrow('API error 500');
    expect(apiGetMock).toHaveBeenCalledWith('/shopping-list-entry/', {
      page_size: 100,
      page: 1,
    });
  });

  it('shows partial grouped state with struck-through checked quantity and recipe button', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <ShoppingList />
        </MemoryRouter>,
      );
    });

    const struckQuantity = Array.from(container.querySelectorAll('span')).find(
      (node) =>
        node.textContent === '1 cup' && node.classList.contains('text-decoration-line-through'),
    );
    expect(struckQuantity).toBeTruthy();

    const checkbox = container.querySelector<HTMLInputElement>(
      '.form-check-input[type="checkbox"]',
    );
    expect(checkbox?.checked).toBe(false);

    const recipeViewButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Show recipe groups"]',
    );
    expect(recipeViewButton).toBeTruthy();
    expect(recipeViewButton?.getAttribute('aria-pressed')).toBe('false');

    act(() => {
      recipeViewButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(recipeViewButton?.getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain('Cake');
    expect(container.textContent).toContain('Bread');
  });

  it('orders recipe groups by meal-plan date and meal-type API data', () => {
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === 'shopping-list') {
        return {
          data: [
            {
              id: 1,
              amount: 1,
              unit_name: 'cup',
              food: makeFood(),
              checked: false,
              list_recipe_data: { recipe_data: { name: 'Dinner Recipe (Order 2)' } },
              recipe_mealplan: {
                recipe_name: 'Dinner Recipe (Order 2)',
                from_date: '2026-01-01',
                // order: 2 but time is earlier — order must win over time to match the meal plan
                meal_type: { name: 'Dinner', order: 2, time: '06:00' },
              },
            },
            {
              id: 2,
              amount: 1,
              unit_name: 'cup',
              food: { ...makeFood(), id: 2, name: 'Milk' },
              checked: false,
              list_recipe_data: { recipe_data: { name: 'Brunch Recipe (Order 1)' } },
              recipe_mealplan: {
                recipe_name: 'Brunch Recipe (Order 1)',
                from_date: '2026-01-01',
                // order: 1 but time is later — order must win over time to match the meal plan
                meal_type: { name: 'Brunch', order: 1, time: '20:00' },
              },
            },
            {
              id: 3,
              amount: 1,
              unit_name: 'cup',
              food: { ...makeFood(), id: 3, name: 'Lettuce' },
              checked: false,
              list_recipe_data: { recipe_data: { name: 'Next Day Recipe' } },
              recipe_mealplan: {
                recipe_name: 'Next Day Recipe',
                from_date: '2026-01-02',
                meal_type: { name: 'Lunch', time: '12:00' },
              },
            },
          ],
          isLoading: false,
          isError: false,
        };
      }
      return { data: [], isLoading: false, isError: false };
    });

    act(() => {
      root.render(
        <MemoryRouter>
          <ShoppingList />
        </MemoryRouter>,
      );
    });

    const viewRecipeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Show recipe groups"]',
    );
    act(() => {
      viewRecipeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const groupNames = Array.from(container.querySelectorAll('h6')).map((node) =>
      node.childNodes[0]?.textContent?.trim(),
    );
    expect(groupNames).toEqual([
      'Brunch Recipe (Order 1)',
      'Dinner Recipe (Order 2)',
      'Next Day Recipe',
    ]);
  });

  it('orders recipe groups by meal-plan date even when shopping list entries lack from_date', () => {
    // Simulates Tandoor API responses that don't include from_date in recipe_mealplan.
    // Wednesday's recipe was added first (firstIndex=0), Monday's last (firstIndex=1).
    // Without the meal-plan fallback, Wednesday would appear first (wrong). With it, Monday appears first.
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === 'shopping-list') {
        return {
          data: [
            {
              id: 1,
              amount: 1,
              unit_name: 'cup',
              food: makeFood(),
              checked: false,
              list_recipe_data: { recipe_data: { name: 'Wednesday Recipe' } },
              recipe_mealplan: { recipe_name: 'Wednesday Recipe' }, // no from_date
            },
            {
              id: 2,
              amount: 1,
              unit_name: 'cup',
              food: { ...makeFood(), id: 2, name: 'Milk' },
              checked: false,
              list_recipe_data: { recipe_data: { name: 'Monday Recipe' } },
              recipe_mealplan: { recipe_name: 'Monday Recipe' }, // no from_date
            },
          ],
          isLoading: false,
          isError: false,
        };
      }
      // meal plan query returns entries with from_date
      return {
        data: [
          {
            id: 10,
            recipe: { id: 100, name: 'Wednesday Recipe' },
            meal_type: { id: 1, name: 'Dinner', order: 2 },
            from_date: '2026-01-08',
          },
          {
            id: 11,
            recipe: { id: 101, name: 'Monday Recipe' },
            meal_type: { id: 1, name: 'Dinner', order: 2 },
            from_date: '2026-01-06',
          },
        ],
        isLoading: false,
        isError: false,
      };
    });

    act(() => {
      root.render(
        <MemoryRouter>
          <ShoppingList />
        </MemoryRouter>,
      );
    });

    const viewRecipeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Show recipe groups"]',
    );
    act(() => {
      viewRecipeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const groupNames = Array.from(container.querySelectorAll('h6')).map((node) =>
      node.childNodes[0]?.textContent?.trim(),
    );
    expect(groupNames).toEqual(['Monday Recipe', 'Wednesday Recipe']);
  });

  it('hides checked items when the hide toggle is enabled', () => {
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === 'shopping-list') {
        return {
          data: [
            {
              id: 1,
              amount: 1,
              unit_name: 'cup',
              food: makeFood(),
              checked: true,
              list_recipe_data: { recipe_data: { name: 'Cake' } },
            },
            {
              id: 2,
              amount: 1,
              unit_name: 'cup',
              food: { ...makeFood(), id: 2, name: 'Milk' },
              checked: false,
              list_recipe_data: { recipe_data: { name: 'Bread' } },
            },
          ],
          isLoading: false,
          isError: false,
        };
      }
      return { data: [], isLoading: false, isError: false };
    });

    act(() => {
      root.render(
        <MemoryRouter>
          <ShoppingList />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain('Flour');
    expect(container.textContent).toContain('Milk');

    const hideCheckedButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Hide checked items"]',
    );
    expect(hideCheckedButton).toBeTruthy();
    expect(hideCheckedButton?.getAttribute('aria-pressed')).toBe('false');

    act(() => {
      hideCheckedButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(hideCheckedButton?.getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).not.toContain('Flour');
    expect(container.textContent).toContain('Milk');

    act(() => {
      hideCheckedButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(hideCheckedButton?.getAttribute('aria-pressed')).toBe('false');
    expect(container.textContent).toContain('Flour');
    expect(container.textContent).toContain('Milk');
  });
});
