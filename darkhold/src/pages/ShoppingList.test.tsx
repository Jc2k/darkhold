import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Food } from '../api/tandoor-types';

const { moveToCheckMutateMock, useQueryMock, useMutationMock, useQueryClientMock } = vi.hoisted(
  () => ({
    moveToCheckMutateMock: vi.fn(),
    useQueryMock: vi.fn(),
    useMutationMock: vi.fn(),
    useQueryClientMock: vi.fn(),
  }),
);

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
  apiPost: vi.fn(),
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
import {
  ShoppingList,
  addShoppingListToEntries,
  fetchAllShoppingListEntries,
  isFullLeftSwipe,
  isFullRightSwipe,
  isInShoppingList,
  isLeftSwipe,
  isRightSwipe,
  updateShoppingListEntries,
} from './ShoppingList';

function makeFood(): Food {
  return {
    id: 1,
    name: 'Flour',
    supermarket_category: { id: 5, name: 'Baking' },
  };
}

function dispatchPointer(
  node: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  clientX: number,
  clientY: number,
) {
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: 'touch' },
  });
  node.dispatchEvent(event);
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
    useMutationMock.mockReturnValue({
      mutate: moveToCheckMutateMock,
      mutateAsync: vi.fn().mockResolvedValue({}),
    });
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

  it('detects horizontal left swipes beyond the movement threshold', () => {
    expect(isLeftSwipe(-60, 5)).toBe(true);
    expect(isLeftSwipe(-59, 5)).toBe(false);
    expect(isLeftSwipe(-80, 100)).toBe(false);
    expect(isLeftSwipe(80, 5)).toBe(false);
  });

  it('detects horizontal right swipes beyond the movement threshold', () => {
    expect(isRightSwipe(60, 5)).toBe(true);
    expect(isRightSwipe(59, 5)).toBe(false);
    expect(isRightSwipe(80, 100)).toBe(false);
    expect(isRightSwipe(-80, 5)).toBe(false);
  });

  it('detects full horizontal swipes beyond the action trigger threshold', () => {
    expect(isFullLeftSwipe(-208, 5)).toBe(true);
    expect(isFullLeftSwipe(-207, 5)).toBe(false);
    expect(isFullLeftSwipe(-240, 250)).toBe(false);
    expect(isFullLeftSwipe(240, 5)).toBe(false);
    expect(isFullRightSwipe(208, 5)).toBe(true);
    expect(isFullRightSwipe(207, 5)).toBe(false);
    expect(isFullRightSwipe(240, 250)).toBe(false);
    expect(isFullRightSwipe(-240, 5)).toBe(false);
  });

  it('adds To Check to selected cached entries without duplicating list membership', () => {
    const toCheck = { id: 7, name: 'To Check' };
    const entries = [
      { id: 1, food: makeFood(), checked: false },
      { id: 2, food: makeFood(), checked: false, shopping_lists: [toCheck] },
      { id: 3, food: makeFood(), checked: false },
    ];

    const updated = addShoppingListToEntries(entries, new Set([1, 2]), toCheck);

    expect(isInShoppingList(updated[0], 'To Check')).toBe(true);
    expect(updated[1].shopping_lists).toEqual([toCheck]);
    expect(updated[2]).toBe(entries[2]);
  });

  it('updates checked and To Check state in cached entries', () => {
    const toCheck = { id: 7, name: 'To Check' };
    const entries = [
      { id: 1, food: makeFood(), checked: true },
      { id: 2, food: makeFood(), checked: true, shopping_lists: [toCheck] },
    ];

    const updated = updateShoppingListEntries(entries, new Set([1, 2]), {
      checked: false,
      isToCheck: true,
      toCheckList: toCheck,
    });

    expect(updated[0]).toMatchObject({ checked: false, shopping_lists: [toCheck] });
    expect(updated[1]).toMatchObject({ checked: false, shopping_lists: [toCheck] });

    const returned = updateShoppingListEntries(updated, new Set([1, 2]), {
      isToCheck: false,
      toCheckList: toCheck,
    });
    expect(returned[0].shopping_lists).toEqual([]);
    expect(returned[1].shopping_lists).toEqual([]);
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
    expect(checkbox).toBeNull();

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

  it('orders recipe groups by meal-plan from_date datetime', () => {
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
              list_recipe_data: {
                recipe_data: { name: 'Dinner Recipe' },
                meal_plan_data: { from_date: '2026-01-01T18:00:00' },
              },
            },
            {
              id: 2,
              amount: 1,
              unit_name: 'cup',
              food: { ...makeFood(), id: 2, name: 'Milk' },
              checked: false,
              list_recipe_data: {
                recipe_data: { name: 'Brunch Recipe' },
                meal_plan_data: { from_date: '2026-01-01T10:00:00' },
              },
            },
            {
              id: 3,
              amount: 1,
              unit_name: 'cup',
              food: { ...makeFood(), id: 3, name: 'Lettuce' },
              checked: false,
              list_recipe_data: {
                recipe_data: { name: 'Next Day Recipe' },
                meal_plan_data: { from_date: '2026-01-02T12:00:00' },
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
    expect(groupNames).toEqual(['Brunch Recipe', 'Dinner Recipe', 'Next Day Recipe']);
  });

  it('keeps ingredients within a recipe group in API order', () => {
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === 'shopping-list') {
        return {
          data: [
            {
              id: 1,
              amount: 1,
              unit_name: 'cup',
              food: { ...makeFood(), id: 101, name: 'Pepper' },
              checked: false,
              list_recipe_data: {
                recipe_data: { name: 'Soup' },
                meal_plan_data: { from_date: '2026-01-01T12:00:00' },
              },
            },
            {
              id: 2,
              amount: 1,
              unit_name: 'cup',
              food: { ...makeFood(), id: 202, name: 'Onion' },
              checked: false,
              list_recipe_data: {
                recipe_data: { name: 'Soup' },
                meal_plan_data: { from_date: '2026-01-01T12:00:00' },
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

    const ingredientNames = Array.from(
      container.querySelectorAll<HTMLAnchorElement>('.list-group-item a'),
    ).map((node) => node.textContent);
    expect(ingredientNames).toEqual(['Pepper', 'Onion']);
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
      'button[aria-label="Show To Buy items only"]',
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

  it('groups the mutually exclusive To Check and To Buy filters together', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <ShoppingList />
        </MemoryRouter>,
      );
    });

    const toCheckButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Show To Check items only"]',
    );
    const viewGroup = container.querySelector('[aria-label="Shopping list view"]');

    const filterGroup = container.querySelector('[aria-label="Shopping list filters"]');
    expect(viewGroup?.querySelectorAll('button')).toHaveLength(2);
    expect(filterGroup?.querySelectorAll('button')).toHaveLength(2);
    expect(toCheckButton?.closest('.btn-group')).toBe(filterGroup);

    const toBuyButton = filterGroup?.querySelector<HTMLButtonElement>(
      'button[aria-label="Show To Buy items only"]',
    );
    act(() => {
      toCheckButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      toBuyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(toCheckButton?.getAttribute('aria-pressed')).toBe('false');
    expect(toBuyButton?.getAttribute('aria-pressed')).toBe('true');
  });

  it('reveals the To Check action after swiping an item left', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <ShoppingList />
        </MemoryRouter>,
      );
    });

    const rowContent = container.querySelector('.shopping-list-swipe-content');
    const action = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Send Flour to To Check"]',
    );

    expect(action?.tabIndex).toBe(-1);
    act(() => {
      dispatchPointer(rowContent!, 'pointerdown', 140, 10);
      dispatchPointer(rowContent!, 'pointermove', 50, 12);
      dispatchPointer(rowContent!, 'pointerup', 50, 12);
    });

    expect(action?.tabIndex).toBe(0);
    expect((rowContent as HTMLDivElement).style.transform).toBe('translateX(-104px)');
  });

  it('expands and triggers the To Check action when an item is swiped fully left', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <ShoppingList />
        </MemoryRouter>,
      );
    });

    const rowContent = container.querySelector('.shopping-list-swipe-content');
    const action = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Send Flour to To Check"]',
    );

    act(() => {
      dispatchPointer(rowContent!, 'pointerdown', 280, 10);
      dispatchPointer(rowContent!, 'pointermove', 40, 12);
    });

    expect((rowContent as HTMLDivElement).style.transform).toBe('translateX(-240px)');
    expect(action?.style.width).toBe('240px');
    expect(action?.classList.contains('shopping-list-swipe-action-ready')).toBe(true);

    act(() => {
      dispatchPointer(rowContent!, 'pointerup', 40, 12);
    });

    expect(moveToCheckMutateMock).toHaveBeenCalledWith({
      entries: [expect.objectContaining({ id: 11 }), expect.objectContaining({ id: 22 })],
      isToCheck: true,
      checked: false,
    });
    expect((rowContent as HTMLDivElement).style.transform).toBe('translateX(0px)');
  });

  it('provides desktop row actions instead of a compact hamburger fallback', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <ShoppingList />
        </MemoryRouter>,
      );
    });

    expect(container.querySelector('button[aria-label="Show actions for Flour"]')).toBeNull();
    const rowActions = container.querySelector('.shopping-list-row-actions');
    expect(rowActions?.querySelector('button[aria-label="Send Flour to To Check"]')).toBeTruthy();
    expect(rowActions?.querySelector('button[aria-label="Mark Flour bought"]')).toBeTruthy();
  });

  it('reveals the bought action after swiping an item right', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <ShoppingList />
        </MemoryRouter>,
      );
    });

    const rowContent = container.querySelector('.shopping-list-swipe-content');
    const action = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Mark Flour bought"]',
    );
    expect(action?.tabIndex).toBe(-1);
    act(() => {
      dispatchPointer(rowContent!, 'pointerdown', 50, 10);
      dispatchPointer(rowContent!, 'pointermove', 140, 12);
      dispatchPointer(rowContent!, 'pointerup', 140, 12);
    });
    expect(action?.tabIndex).toBe(0);
    expect((rowContent as HTMLDivElement).style.transform).toBe('translateX(104px)');
  });

  it('filters the view to entries assigned to To Check', () => {
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === 'shopping-list') {
        return {
          data: [
            {
              id: 1,
              food: makeFood(),
              checked: false,
              shopping_lists: [{ id: 7, name: 'To Check' }],
            },
            {
              id: 2,
              food: { ...makeFood(), id: 2, name: 'Milk' },
              checked: false,
            },
          ],
          isLoading: false,
          isError: false,
        };
      }
      return { data: { id: 7, name: 'To Check' }, isLoading: false, isError: false };
    });

    act(() => {
      root.render(
        <MemoryRouter>
          <ShoppingList />
        </MemoryRouter>,
      );
    });

    const toCheckButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Show To Check items only"]',
    );
    expect(toCheckButton?.getAttribute('aria-pressed')).toBe('false');
    expect(container.textContent).toContain('Flour');
    expect(container.textContent).toContain('Milk');

    act(() => {
      toCheckButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(toCheckButton?.getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain('Flour');
    expect(container.textContent).not.toContain('Milk');
  });
});
