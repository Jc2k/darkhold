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
  queryOptions: (options: unknown) => options,
  useQuery: useQueryMock,
  useMutation: useMutationMock,
  useQueryClient: useQueryClientMock,
}));

vi.mock('../api/client', () => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  searchFoods: vi.fn(),
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

import { apiDelete, apiGet, apiPost } from '../api/client';
import { broadcastInvalidation } from '../hooks/useInvalidationSocket';
import {
  ShoppingList,
  addShoppingListToEntries,
  fetchAllShoppingListEntries,
  formatAmount,
  getShoppingListEntriesToClear,
  isFullLeftSwipe,
  isFullRightSwipe,
  isInShoppingList,
  isLeftSwipe,
  isRightSwipe,
  removeShoppingListEntries,
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
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));

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
              list_recipe_data: {
                recipe_data: { name: 'Cake' },
                meal_plan_data: { from_date: '2026-05-31' },
              },
            },
            {
              id: 22,
              amount: 2,
              unit_name: 'cup',
              food: makeFood(),
              checked: false,
              list_recipe_data: {
                recipe_data: { name: 'Bread' },
                meal_plan_data: { from_date: '2026-06-01' },
              },
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
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('does not broadcast while ensuring the To Check list exists', async () => {
    vi.mocked(apiPost).mockResolvedValue({ id: 7, name: 'To Check' });

    act(() => {
      root.render(
        <MemoryRouter>
          <ShoppingList />
        </MemoryRouter>,
      );
    });

    const toCheckQuery = useQueryMock.mock.calls
      .map(([options]) => options as { queryKey: string[]; queryFn: () => Promise<unknown> })
      .find((options) => options.queryKey[0] === 'shopping-list-to-check');

    await expect(toCheckQuery?.queryFn()).resolves.toEqual({ id: 7, name: 'To Check' });
    expect(apiPost).toHaveBeenCalledWith('/shopping-list/', { name: 'To Check' });
    expect(broadcastInvalidation).not.toHaveBeenCalled();
  });

  it('hides quantities and units for manual requests', () => {
    expect(formatAmount({ id: 1, amount: 1, unit: null, food: makeFood(), checked: false })).toBe(
      '',
    );
    expect(
      formatAmount({ id: 2, amount: 1, unit_name: 'cup', food: makeFood(), checked: false }),
    ).toBe('');
    expect(
      formatAmount({
        id: 3,
        amount: 1,
        unit: null,
        food: makeFood(),
        checked: false,
        list_recipe_data: {
          recipe_data: { name: 'Cake' },
          meal_plan_data: { from_date: '2026-05-31' },
        },
      }),
    ).toBe('1');
    expect(
      formatAmount({
        id: 4,
        amount: 2,
        unit_name: 'cup',
        food: makeFood(),
        checked: false,
        list_recipe_data: {
          recipe_data: { name: 'Cake' },
          meal_plan_data: { from_date: '2026-05-31' },
        },
      }),
    ).toBe('2 cup');
  });

  it('selects entries for each shopping-list delete action', () => {
    const entries = [
      { id: 1, food: makeFood(), checked: false },
      {
        id: 2,
        food: makeFood(),
        checked: true,
        list_recipe_data: { recipe_data: { name: 'Cake' } },
      },
      { id: 3, food: makeFood(), checked: true },
    ];

    expect(getShoppingListEntriesToClear(entries, 'all')).toEqual(entries);
    expect(getShoppingListEntriesToClear(entries, 'requests')).toEqual([entries[0], entries[2]]);
    expect(getShoppingListEntriesToClear(entries, 'meal-plan-ingredients')).toEqual([entries[1]]);
    expect(getShoppingListEntriesToClear(entries, 'checked')).toEqual([entries[1], entries[2]]);
  });

  it('marks manual requests with a pencil and groups them first in recipe view', () => {
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === 'shopping-list') {
        return {
          data: [
            { id: 1, food: { ...makeFood(), id: 2, name: 'Tomatoes' }, checked: false },
            {
              id: 2,
              food: makeFood(),
              checked: false,
              list_recipe_data: {
                recipe_data: { name: 'Cake' },
                meal_plan_data: { from_date: '2026-05-31' },
              },
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

    expect(container.querySelector('[aria-label="Added manually"]')).toBeTruthy();
    const recipeViewButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Show recipe groups"]',
    );
    act(() => recipeViewButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    const text = container.textContent ?? '';
    expect(text.indexOf('Requests')).toBeLessThan(text.indexOf('Cake'));
  });

  it('marks foods assigned to the Amazon shopping list with an Amazon icon', () => {
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === 'shopping-list') {
        return {
          data: [
            {
              id: 1,
              food: makeFood(),
              checked: false,
              shopping_lists: [{ id: 8, name: 'Amazon' }],
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

    expect(container.querySelector('[aria-label="Amazon"]')).toBeTruthy();
  });

  it('shows meal plan recipes without shopping entries in a notes category section', () => {
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
                recipe: 10,
                recipe_data: { name: 'Cake' },
                meal_plan_data: { from_date: '2026-06-01' },
              },
            },
          ],
          isLoading: false,
          isError: false,
        };
      }
      if (queryKey[0] === 'meal-plan') {
        return {
          data: {
            count: 2,
            next: null,
            previous: null,
            results: [
              { id: 100, recipe: { id: 10, name: 'Cake', created_by: 1 }, from_date: '2026-06-01' },
              {
                id: 101,
                recipe: { id: 20, name: 'Plain Toast', created_by: 1 },
                from_date: '2026-06-02',
              },
            ],
          },
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

    const groupNames = Array.from(container.querySelectorAll('h6')).map((node) =>
      node.childNodes[0]?.textContent?.trim(),
    );
    expect(groupNames).toEqual(['Notes', 'Baking']);
    expect(container.textContent).toContain('Plain Toast');
    expect(container.textContent).toContain('This recipe has no ingredients.');
    expect(container.querySelector('a[href="/recipe/20"]')?.textContent).toBe('Plain Toast');
    expect(container.querySelector('button[aria-label="Show details for Plain Toast"]')).toBeNull();
    expect(container.textContent).toContain('Flour');
  });

  it('shows only ad-hoc requests when the shopping list has no meal-plan entries', () => {
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === 'shopping-list') {
        return {
          data: [
            {
              id: 1,
              food: { ...makeFood(), id: 2, name: 'Milk' },
              checked: false,
            },
          ],
          isLoading: false,
          isError: false,
        };
      }
      if (queryKey[0] === 'meal-plan') {
        return {
          data: {
            count: 1,
            next: null,
            previous: null,
            results: [
              {
                id: 101,
                recipe: { id: 20, name: 'Current Week Meal', created_by: 1 },
                from_date: '2026-06-02',
              },
            ],
          },
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

    expect(container.textContent).toContain('Milk');
    expect(container.textContent).not.toContain('Current Week Meal');
    expect(container.textContent).not.toContain('This recipe has no ingredients.');
  });

  it('orders recipes with notes by meal-plan date and shows no ingredients notes', () => {
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
                recipe: 10,
                recipe_data: { name: 'Dinner Recipe' },
                meal_plan_data: { from_date: '2026-06-03T18:00:00' },
              },
            },
          ],
          isLoading: false,
          isError: false,
        };
      }
      if (queryKey[0] === 'meal-plan') {
        return {
          data: {
            count: 3,
            next: null,
            previous: null,
            results: [
              {
                id: 101,
                recipe: { id: 20, name: 'Blank Brunch', created_by: 1 },
                from_date: '2026-06-03T10:00:00',
                note: 'Serve with jam.',
              },
              {
                id: 100,
                recipe: { id: 10, name: 'Dinner Recipe', created_by: 1 },
                from_date: '2026-06-03T18:00:00',
                note: 'Double the sauce.',
              },
              {
                id: 102,
                recipe: { id: 30, name: 'Blank Next Day', created_by: 1 },
                from_date: '2026-06-04T12:00:00',
                note: 'Pack leftovers.',
              },
            ],
          },
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

    const categoryText = container.textContent ?? '';
    expect(categoryText.indexOf('Blank Brunch')).toBeLessThan(
      categoryText.indexOf('Dinner Recipe'),
    );
    expect(categoryText.indexOf('Dinner Recipe')).toBeLessThan(
      categoryText.indexOf('Blank Next Day'),
    );
    expect(categoryText).toContain('Double the sauce.');

    const viewRecipeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Show recipe groups"]',
    );
    act(() => {
      viewRecipeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const groupNames = Array.from(container.querySelectorAll('h6')).map((node) =>
      node.childNodes[0]?.textContent?.trim(),
    );
    expect(groupNames).toEqual(['Blank Brunch', 'Dinner Recipe', 'Blank Next Day']);
    const blankBrunchSection = Array.from(container.querySelectorAll('div.mb-4')).find(
      (section) =>
        section.querySelector('h6')?.childNodes[0]?.textContent?.trim() === 'Blank Brunch',
    );
    const blankBrunchNotes = Array.from(blankBrunchSection?.querySelectorAll('p') ?? []).map(
      (node) => node.textContent,
    );
    expect(blankBrunchNotes).toEqual(['Serve with jam.', 'This recipe has no ingredients.']);
    expect(blankBrunchSection?.querySelector('.list-group')).toBeNull();
    expect(
      container.querySelector('button[aria-label="Show details for Blank Brunch"]'),
    ).toBeNull();
    const dinnerSection = Array.from(container.querySelectorAll('div.mb-4')).find(
      (section) =>
        section.querySelector('h6')?.childNodes[0]?.textContent?.trim() === 'Dinner Recipe',
    );
    const dinnerText = dinnerSection?.textContent ?? '';
    expect(dinnerText.indexOf('Double the sauce.')).toBeLessThan(dinnerText.indexOf('Flour'));
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

  it('removes accepted bulk deletions from cached entries', () => {
    const entries = [
      { id: 1, food: makeFood(), checked: false },
      { id: 2, food: makeFood(), checked: false },
      { id: 3, food: makeFood(), checked: false },
    ];

    expect(removeShoppingListEntries(entries, new Set([1, 3]))).toEqual([entries[1]]);
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
      ordering: '-created_at',
      page_size: 100,
      page: 1,
    });
    expect(apiGetMock).toHaveBeenNthCalledWith(2, '/shopping-list-entry/', {
      ordering: '-created_at',
      page_size: 100,
      page: 2,
    });
  });

  it('propagates errors while fetching shopping list pages', async () => {
    const apiGetMock = vi.mocked(apiGet);
    apiGetMock.mockRejectedValueOnce(new Error('API error 500'));

    await expect(fetchAllShoppingListEntries()).rejects.toThrow('API error 500');
    expect(apiGetMock).toHaveBeenCalledWith('/shopping-list-entry/', {
      ordering: '-created_at',
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
      container.querySelectorAll<HTMLDivElement>('.shopping-list-swipe-content .flex-grow-1'),
    ).map((node) => node.textContent);
    expect(ingredientNames).toEqual(['1 cupPepper', '1 cupOnion']);
    expect(container.querySelector('.list-group-item a')).toBeNull();
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
    expect(viewGroup?.previousElementSibling).toBeNull();
    expect(filterGroup?.previousElementSibling).toBe(viewGroup);
    expect(toCheckButton?.closest('.btn-group')).toBe(filterGroup);

    const toBuyButton = filterGroup?.querySelector<HTMLButtonElement>(
      'button[aria-label="Show To Buy items only"]',
    );
    expect(filterGroup?.querySelectorAll('button')[0]).toBe(toBuyButton);
    expect(filterGroup?.querySelectorAll('button')[1]).toBe(toCheckButton);
    expect(toBuyButton?.querySelector('.bi-basket3')).not.toBeNull();
    expect(toCheckButton?.querySelector('.bi-eyeglasses')).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Clear shopping list"] .bi-trash3'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Choose shopping list items to delete"]'),
    ).not.toBeNull();

    act(() => {
      toBuyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(toBuyButton?.getAttribute('aria-pressed')).toBe('true');
    expect(toBuyButton?.querySelector('.bi-basket3-fill')).not.toBeNull();

    act(() => {
      toCheckButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(toBuyButton?.getAttribute('aria-pressed')).toBe('false');
    expect(toBuyButton?.querySelector('.bi-basket3')).not.toBeNull();
    expect(toCheckButton?.getAttribute('aria-pressed')).toBe('true');
  });

  it('deletes only manual requests from the delete dropdown and invalidates cached views', async () => {
    const setQueryData = vi.fn();
    const invalidateQueries = vi.fn();
    const fetchQuery = vi.fn().mockResolvedValue('/meal-plan/2026-05-30');
    useQueryClientMock.mockReturnValue({ setQueryData, invalidateQueries, fetchQuery });
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === 'shopping-list') {
        return {
          data: [
            { id: 1, food: makeFood(), checked: false },
            {
              id: 2,
              food: makeFood(),
              checked: true,
              list_recipe_data: { recipe_data: { name: 'Cake' } },
            },
          ],
          isLoading: false,
          isError: false,
        };
      }
      return { data: { id: 7, name: 'To Check' }, isLoading: false, isError: false };
    });
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    vi.mocked(apiDelete).mockResolvedValue(undefined);

    act(() => {
      root.render(
        <MemoryRouter>
          <ShoppingList />
        </MemoryRouter>,
      );
    });

    const deleteMenuToggle = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Choose shopping list items to delete"]',
    );
    act(() => {
      deleteMenuToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.body.textContent).toContain('Delete requests');
    expect(document.body.textContent).toContain('Delete meal plan ingredients');
    expect(document.body.textContent).toContain('Delete checked');
    const deleteRequests = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('.dropdown-item'),
    ).find((item) => item.textContent === 'Delete requests');
    await act(async () => {
      deleteRequests?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(window.confirm).toHaveBeenCalledWith('Remove 1 item selected by “Delete requests”?');
    expect(apiDelete).toHaveBeenCalledTimes(1);
    expect(apiDelete).toHaveBeenCalledWith('/shopping-list-entry/1/');
    expect(setQueryData).toHaveBeenCalledWith(['shopping-list'], expect.any(Function));
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['shopping-list'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['meal-plan-redirect-week-path'] });
  });

  it('does not show swipe guidance', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <ShoppingList />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).not.toContain('Swipe left to toggle To Check.');
    expect(container.textContent).not.toContain('Swipe right to mark an item bought');
  });

  it('keeps the swipe action for a To Check item icon-only', () => {
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === 'shopping-list') {
        return {
          data: [
            {
              id: 11,
              food: makeFood(),
              checked: false,
              shopping_lists: [{ id: 7, name: 'To Check' }],
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

    const action = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Return Flour from To Check"]',
    );
    expect(action?.textContent).toBe('');
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

  it('continues dragging from the revealed swipe offset instead of snapping back', () => {
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
      dispatchPointer(rowContent!, 'pointerdown', 140, 10);
      dispatchPointer(rowContent!, 'pointermove', 50, 12);
      dispatchPointer(rowContent!, 'pointerup', 50, 12);
    });
    expect((rowContent as HTMLDivElement).style.transform).toBe('translateX(-104px)');

    act(() => {
      dispatchPointer(rowContent!, 'pointerdown', 140, 10);
      dispatchPointer(rowContent!, 'pointermove', 120, 12);
    });

    expect(rowContent?.classList.contains('shopping-list-swipe-content-dragging')).toBe(true);
    expect((rowContent as HTMLDivElement).style.transform).toBe('translateX(-124px)');
    expect(action?.style.width).toBe('124px');

    act(() => {
      dispatchPointer(rowContent!, 'pointerup', 120, 12);
    });
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
    expect(rowActions?.querySelector('button[aria-label="Show details for Flour"]')).toBeTruthy();
    expect(rowActions?.querySelector('button[aria-label="Send Flour to To Check"]')).toBeTruthy();
    expect(rowActions?.querySelector('button[aria-label="Mark Flour bought"]')).toBeTruthy();
  });

  it('opens ingredient details from the desktop info action with true facts and contributing recipes', () => {
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === 'shopping-list') {
        return {
          data: [
            {
              id: 1,
              food: makeFood(),
              checked: false,
              created_by: { username: 'alice' },
              shopping_lists: [
                { id: 7, name: 'To Check' },
                { id: 8, name: 'Amazon' },
              ],
            },
            {
              id: 2,
              food: makeFood(),
              checked: false,
              list_recipe_data: { recipe: 42, recipe_data: { name: 'Birthday Cake' } },
            },
            {
              id: 3,
              food: makeFood(),
              checked: false,
              list_recipe_data: { recipe: 42, recipe_data: { name: 'Birthday Cake' } },
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

    expect(container.querySelector('.list-group-item a')).toBeNull();
    const infoButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Show details for Flour"]',
    );
    act(() => infoButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(document.body.textContent).toContain('This item is bought from Amazon.');
    expect(document.body.textContent).toContain('This item was requested by alice.');
    expect(document.body.textContent).toContain('Check to see if we have any.');
    expect(
      document.body.querySelector<HTMLAnchorElement>('a[href="/recipe/42"]')?.textContent,
    ).toBe('Birthday Cake');
    expect(document.body.textContent).toContain('Added for recipes');
    expect(document.body.querySelectorAll('a[href="/recipe/42"]')).toHaveLength(1);
    expect(
      document.body.querySelector<HTMLAnchorElement>('a[href="/ingredient/1"]')?.textContent,
    ).toBe('all recipes');
  });

  it('opens ingredient details after a touch long press', () => {
    vi.useFakeTimers();
    act(() => {
      root.render(
        <MemoryRouter>
          <ShoppingList />
        </MemoryRouter>,
      );
    });

    const rowContent = container.querySelector('.shopping-list-swipe-content');
    act(() => {
      dispatchPointer(rowContent!, 'pointerdown', 140, 10);
      vi.advanceTimersByTime(500);
    });

    expect(document.body.querySelector('.modal-title')?.textContent).toBe('Flour');
    expect(rowContent?.classList.contains('shopping-list-long-press-pending')).toBe(true);
    expect((rowContent as HTMLDivElement).style.transform).toBe('translateX(0px)');

    act(() => dispatchPointer(rowContent!, 'pointerup', 140, 10));

    expect(rowContent?.classList.contains('shopping-list-long-press-pending')).toBe(false);
  });

  it('does not start a swipe when using desktop row actions', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <ShoppingList />
        </MemoryRouter>,
      );
    });

    const rowContent = container.querySelector('.shopping-list-swipe-content');
    const desktopAction = container.querySelector<HTMLButtonElement>(
      '.shopping-list-row-actions button[aria-label="Mark Flour bought"]',
    );

    act(() => {
      dispatchPointer(desktopAction!, 'pointerdown', 140, 10);
      dispatchPointer(desktopAction!, 'pointermove', 50, 12);
      dispatchPointer(desktopAction!, 'pointerup', 50, 12);
      desktopAction?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect((rowContent as HTMLDivElement).style.transform).toBe('translateX(0px)');
    expect(moveToCheckMutateMock).toHaveBeenCalledWith({
      entries: [expect.objectContaining({ id: 11 }), expect.objectContaining({ id: 22 })],
      checked: true,
      isToCheck: false,
    });
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
