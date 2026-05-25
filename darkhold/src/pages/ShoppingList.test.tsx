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

import { ShoppingList } from './ShoppingList';

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
    useQueryMock.mockReturnValue({
      data: {
        results: [
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
      },
      isLoading: false,
      isError: false,
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

  it('shows partial grouped state with struck-through checked quantity and recipe toggle', () => {
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

    const viewSwitch = container.querySelector<HTMLInputElement>('#shopping-view-mode');
    expect(viewSwitch).toBeTruthy();

    act(() => {
      viewSwitch?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Cake');
    expect(container.textContent).toContain('Bread');
  });

  it('orders recipe groups by meal-plan date and meal-type time', () => {
    useQueryMock.mockReturnValue({
      data: {
        results: [
          {
            id: 1,
            amount: 1,
            unit_name: 'cup',
            food: makeFood(),
            checked: false,
            list_recipe_data: { recipe_data: { name: 'Dinner Recipe' } },
            recipe_mealplan: {
              recipe_name: 'Dinner Recipe',
              from_date: '2026-01-01',
              meal_type: { name: 'Dinner', time: '18:00' },
            },
          },
          {
            id: 2,
            amount: 1,
            unit_name: 'cup',
            food: { ...makeFood(), id: 2, name: 'Milk' },
            checked: false,
            list_recipe_data: { recipe_data: { name: 'Breakfast Recipe' } },
            recipe_mealplan: {
              recipe_name: 'Breakfast Recipe',
              from_date: '2026-01-01',
              meal_type: { name: 'Breakfast', time: '08:00' },
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
      },
      isLoading: false,
      isError: false,
    });

    act(() => {
      root.render(
        <MemoryRouter>
          <ShoppingList />
        </MemoryRouter>,
      );
    });

    const viewSwitch = container.querySelector<HTMLInputElement>('#shopping-view-mode');
    act(() => {
      viewSwitch?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const groupNames = Array.from(container.querySelectorAll('h6')).map((node) =>
      node.childNodes[0]?.textContent?.trim(),
    );
    expect(groupNames).toEqual(['Breakfast Recipe', 'Dinner Recipe', 'Next Day Recipe']);
  });

  it('hides checked items when the hide toggle is enabled', () => {
    useQueryMock.mockReturnValue({
      data: {
        results: [
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
      },
      isLoading: false,
      isError: false,
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

    const hideCheckedSwitch = container.querySelector<HTMLInputElement>('#shopping-hide-checked');
    expect(hideCheckedSwitch).toBeTruthy();

    act(() => {
      hideCheckedSwitch?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).not.toContain('Flour');
    expect(container.textContent).toContain('Milk');

    act(() => {
      hideCheckedSwitch?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Flour');
    expect(container.textContent).toContain('Milk');
  });
});
