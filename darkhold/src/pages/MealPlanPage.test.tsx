import { act, type RefCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MealType, Recipe } from '../api/tandoor-types';

const {
  useDroppableMock,
  useSensorMock,
  useSensorsMock,
  createMealPlanMock,
  apiGetMock,
  asyncTypeaheadState,
} = vi.hoisted(() => ({
  useDroppableMock: vi.fn(),
  useSensorMock: vi.fn(),
  useSensorsMock: vi.fn(),
  createMealPlanMock: {
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  },
  apiGetMock: vi.fn(),
  asyncTypeaheadState: {
    selected: [] as Recipe[],
    latestProps: null as null | { onChange?: (selected: Recipe[]) => void },
  },
}));

type ReactActGlobal = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core');
  return {
    ...actual,
    useDroppable: useDroppableMock,
    useSensor: useSensorMock,
    useSensors: useSensorsMock,
  };
});

vi.mock('../hooks/useMealPlan', () => ({
  MEAL_PLAN_ITEM_QUERY_PARAMS: {
    from_date: '1900-01-01',
    to_date: '2100-01-01',
  },
  useMealPlan: vi.fn(),
  useDeleteMealPlan: vi.fn(),
  useCreateMealPlan: () => createMealPlanMock,
  useUpdateMealPlan: vi.fn(),
}));

vi.mock('../api/client', () => ({
  apiGet: apiGetMock,
  apiDelete: vi.fn(),
}));

vi.mock('react-bootstrap-typeahead', () => ({
  AsyncTypeahead: (props: { onChange?: (selected: Recipe[]) => void }) => {
    asyncTypeaheadState.latestProps = props;
    return (
      <button
        type="button"
        onClick={() => {
          props.onChange?.(asyncTypeaheadState.selected);
        }}
      >
        Select recipe
      </button>
    );
  },
}));

import { MouseSensor, TouchSensor, type Collision } from '@dnd-kit/core';
import { DroppableTableRow } from './DroppableTableRow';
import {
  AddMealModal,
  getMealPlanRouteFromDate,
  getEmptyWeekendLunchDates,
  getDateMealTypeCollisionId,
  resolveDropTargetContainerId,
  shoppingListHasCurrentWeekEntries,
  shouldClearAssistantSessionFromShoppingList,
  useMealPlanSensors,
} from './MealPlanPage';

function SensorHarness() {
  useMealPlanSensors();
  return null;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('DroppableTableRow', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const actGlobal = globalThis as ReactActGlobal;

  beforeEach(() => {
    actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useDroppableMock.mockReset();
    useSensorMock.mockReset();
    useSensorsMock.mockReset();
    useDroppableMock.mockReturnValue({
      setNodeRef: vi.fn() as RefCallback<HTMLTableRowElement>,
      isOver: false,
    });
    useSensorMock.mockImplementation((sensor, options) => ({ sensor, options }));
    useSensorsMock.mockImplementation((...sensors) => sensors);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete actGlobal.IS_REACT_ACT_ENVIRONMENT;
  });

  it('adds the drop target class when hovered', () => {
    useDroppableMock.mockReturnValue({
      setNodeRef: vi.fn() as RefCallback<HTMLTableRowElement>,
      isOver: true,
    });

    act(() => {
      root.render(
        <table>
          <tbody>
            <DroppableTableRow dateKey="2026-05-07" className="base-row">
              <td>Meal</td>
            </DroppableTableRow>
          </tbody>
        </table>,
      );
    });

    expect(container.querySelector('tr')?.className).toBe('base-row meal-plan-row-drop-target');
  });

  it('leaves the base class unchanged when not hovered', () => {
    act(() => {
      root.render(
        <table>
          <tbody>
            <DroppableTableRow dateKey="2026-05-07" className="base-row">
              <td>Meal</td>
            </DroppableTableRow>
          </tbody>
        </table>,
      );
    });

    expect(container.querySelector('tr')?.className).toBe('base-row');
  });
});

describe('useMealPlanSensors', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const actGlobal = globalThis as ReactActGlobal;

  beforeEach(() => {
    actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useSensorMock.mockReset();
    useSensorsMock.mockReset();
    useSensorMock.mockImplementation((sensor, options) => ({ sensor, options }));
    useSensorsMock.mockImplementation((...sensors) => sensors);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete actGlobal.IS_REACT_ACT_ENVIRONMENT;
  });

  it('uses mouse and touch sensors with expected activation constraints', () => {
    act(() => {
      root.render(<SensorHarness />);
    });

    expect(useSensorMock).toHaveBeenNthCalledWith(1, MouseSensor, {
      activationConstraint: { distance: 8 },
    });
    expect(useSensorMock).toHaveBeenNthCalledWith(2, TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    });
    expect(useSensorsMock).toHaveBeenCalledTimes(1);
  });
});

describe('getDateMealTypeCollisionId', () => {
  it('prefers a same-day meal-type collision that is not the active container', () => {
    const collisions = [
      { id: '2026-05-25' },
      { id: '2026-05-25__2' },
      { id: '2026-05-25__1' },
    ] as Collision[];

    expect(getDateMealTypeCollisionId('2026-05-25', '2026-05-25__1', collisions)).toBe(
      '2026-05-25__2',
    );
  });

  it('falls back to a same-day meal-type collision when only the active container matches', () => {
    const collisions = [{ id: '2026-05-25' }, { id: '2026-05-25__1' }] as Collision[];

    expect(getDateMealTypeCollisionId('2026-05-25', '2026-05-25__1', collisions)).toBe(
      '2026-05-25__1',
    );
  });

  it('returns null when no same-day meal-type collisions exist', () => {
    const collisions = [{ id: '2026-05-25' }, { id: '2026-05-26__1' }] as Collision[];

    expect(getDateMealTypeCollisionId('2026-05-25', '2026-05-25__1', collisions)).toBeNull();
  });
});

describe('resolveDropTargetContainerId', () => {
  it('uses fallback sortable container when drag end has no over data container', () => {
    expect(
      resolveDropTargetContainerId({
        overId: 123,
        activeContainerId: '2026-05-25__1',
        overSortableContainerId: null,
        fallbackSortableContainerId: '2026-05-26__2',
      }),
    ).toBe('2026-05-26__2');
  });

  it('prefers meal-type collision when over id is day-only container id', () => {
    const collisions = [{ id: '2026-05-26' }, { id: '2026-05-26__2' }] as Collision[];
    expect(
      resolveDropTargetContainerId({
        overId: '2026-05-26',
        activeContainerId: '2026-05-25__1',
        collisions,
      }),
    ).toBe('2026-05-26__2');
  });

  it('returns null for entry-id over target without sortable container data', () => {
    expect(
      resolveDropTargetContainerId({
        overId: 456,
        activeContainerId: '2026-05-25__1',
      }),
    ).toBeNull();
  });
});

describe('getEmptyWeekendLunchDates', () => {
  it('returns empty lunch slots only for saturday and sunday', () => {
    const days = [
      new Date('2026-05-30T00:00:00Z'),
      new Date('2026-05-31T00:00:00Z'),
      new Date('2026-06-01T00:00:00Z'),
    ];
    const byDayAndMealType = {
      '2026-05-30': { 2: [] },
      '2026-05-31': { 2: [{ id: 1 }] },
      '2026-06-01': { 2: [] },
    } as unknown as Record<string, Record<number, unknown[]>>;

    expect(
      getEmptyWeekendLunchDates(
        days,
        byDayAndMealType as unknown as Record<string, Record<number, never[]>>,
        2,
      ),
    ).toEqual(['2026-05-30']);
  });

  describe('meal assistant shopping list lifecycle', () => {
    const weekStart = '2026-06-06';
    const weekEnd = '2026-06-12';

    it('detects shopping-list items that belong to the current week', () => {
      expect(
        shoppingListHasCurrentWeekEntries(
          [
            {
              id: 1,
              checked: false,
              food: null,
              recipe_mealplan: { recipe_name: 'Aubergine Bake' },
            },
            {
              id: 2,
              checked: false,
              food: null,
              recipe_mealplan: { recipe_name: 'Pasta', from_date: '2026-06-10T00:00:00Z' },
            },
          ],
          weekStart,
          weekEnd,
        ),
      ).toBe(true);
    });

    it('clears assistant session when the shopping list is empty', () => {
      expect(shouldClearAssistantSessionFromShoppingList([], weekStart, weekEnd)).toBe(true);
    });

    it('clears assistant session when no shopping-list item is from the current week', () => {
      expect(
        shouldClearAssistantSessionFromShoppingList(
          [
            {
              id: 1,
              checked: false,
              food: null,
              recipe_mealplan: { recipe_name: 'Old Week Curry', from_date: '2026-06-01T00:00:00Z' },
            },
            {
              id: 2,
              checked: true,
              food: null,
              recipe_mealplan: {
                recipe_name: 'Future Week Pie',
                from_date: '2026-06-20T00:00:00Z',
              },
            },
          ],
          weekStart,
          weekEnd,
        ),
      ).toBe(true);
    });

    it('keeps assistant session when at least one item is for the current week', () => {
      expect(
        shouldClearAssistantSessionFromShoppingList(
          [
            {
              id: 1,
              checked: false,
              food: null,
              recipe_mealplan: {
                recipe_name: 'Future Week Pie',
                from_date: '2026-06-20T00:00:00Z',
              },
            },
            {
              id: 2,
              checked: false,
              food: null,
              recipe_mealplan: {
                recipe_name: 'Current Week Pasta',
                from_date: '2026-06-12T12:00:00Z',
              },
            },
          ],
          weekStart,
          weekEnd,
        ),
      ).toBe(false);
    });

    it('keeps assistant session while assisted entries still exist', () => {
      expect(
        shouldClearAssistantSessionFromShoppingList([], weekStart, weekEnd, {
          hasAssistedEntries: true,
        }),
      ).toBe(false);
    });

    it('keeps assistant session while assisted planning is in progress', () => {
      expect(
        shouldClearAssistantSessionFromShoppingList([], weekStart, weekEnd, {
          isPlanning: true,
        }),
      ).toBe(false);
    });
  });

  it('includes configured public holidays even when they are weekdays', () => {
    const days = [new Date('2026-06-02T00:00:00Z')];
    const byDayAndMealType = {
      '2026-06-02': { 2: [] },
    } as unknown as Record<string, Record<number, unknown[]>>;

    expect(
      getEmptyWeekendLunchDates(
        days,
        byDayAndMealType as unknown as Record<string, Record<number, never[]>>,
        2,
        ['2026-06-02'],
      ),
    ).toEqual(['2026-06-02']);
  });
});

describe('date jump helper', () => {
  it('builds a meal-plan route for valid date input values', () => {
    expect(getMealPlanRouteFromDate('2026-01-01')).toBe('/meal-plan/2025-12-27');
    expect(getMealPlanRouteFromDate('2026-12-31')).toBe('/meal-plan/2026-12-26');
  });

  it('returns null route for invalid date input values', () => {
    expect(getMealPlanRouteFromDate('2026-13-40')).toBeNull();
    expect(getMealPlanRouteFromDate('2026/01/01')).toBeNull();
  });
});

describe('AddMealModal', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const actGlobal = globalThis as ReactActGlobal;

  beforeEach(() => {
    actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    createMealPlanMock.mutateAsync.mockClear();
    createMealPlanMock.isPending = false;
    apiGetMock.mockReset();
    asyncTypeaheadState.selected = [];
    asyncTypeaheadState.latestProps = null;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete actGlobal.IS_REACT_ACT_ENVIRONMENT;
  });

  it('awaits in-flight recipe details on submit without refetching', async () => {
    const deferredRecipe = createDeferred<Recipe>();
    apiGetMock.mockImplementation((path: string) => {
      if (path === '/recipe/1/') return deferredRecipe.promise;
      return Promise.reject(new Error(`Unexpected path ${path}`));
    });

    act(() => {
      root.render(
        <AddMealModal
          date="2026-05-30"
          onHide={vi.fn()}
          mealTypes={[{ id: 2, name: 'Dinner' } as MealType]}
        />,
      );
    });

    asyncTypeaheadState.selected = [{ id: 1, name: 'Lasagne', servings: 4 } as Recipe];

    await act(async () => {
      Array.from(document.querySelectorAll('button'))
        .find((button) => button.textContent?.trim() === 'Select recipe')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const addButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Add',
    ) as HTMLButtonElement;

    expect(addButton.disabled).toBe(false);

    await act(async () => {
      addButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(createMealPlanMock.mutateAsync).not.toHaveBeenCalled();
    expect(apiGetMock).toHaveBeenCalledTimes(1);
    expect(addButton.disabled).toBe(true);

    await act(async () => {
      deferredRecipe.resolve({
        id: 1,
        name: 'Lasagne',
        servings: 4,
        steps: [],
      } as unknown as Recipe);
      await deferredRecipe.promise;
      await Promise.resolve();
    });

    expect(apiGetMock).toHaveBeenCalledTimes(1);
    expect(createMealPlanMock.mutateAsync).toHaveBeenCalledTimes(1);
    expect(createMealPlanMock.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        recipe: 1,
        meal_type: 2,
      }),
    );
  });

  it('ignores stale recipe detail responses from older selections', async () => {
    const firstDeferred = createDeferred<Recipe>();
    apiGetMock.mockImplementation((path: string) => {
      if (path === '/recipe/1/') return firstDeferred.promise;
      if (path === '/recipe/2/')
        return Promise.resolve({
          id: 2,
          name: 'Porridge',
          servings: 2,
          keywords: [{ name: 'Breakfast' }],
          steps: [],
        } as unknown as Recipe);
      return Promise.reject(new Error(`Unexpected path ${path}`));
    });

    act(() => {
      root.render(
        <AddMealModal
          date="2026-05-30"
          onHide={vi.fn()}
          mealTypes={
            [
              { id: 1, name: 'Breakfast' },
              { id: 2, name: 'Dinner' },
            ] as MealType[]
          }
        />,
      );
    });

    const selectRecipeButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Select recipe',
    ) as HTMLButtonElement;

    asyncTypeaheadState.selected = [{ id: 1, name: 'Curry', servings: 4 } as Recipe];
    await act(async () => {
      selectRecipeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    asyncTypeaheadState.selected = [{ id: 2, name: 'Porridge', servings: 2 } as Recipe];
    await act(async () => {
      selectRecipeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      firstDeferred.resolve({
        id: 1,
        name: 'Curry',
        servings: 4,
        keywords: [{ name: 'Dinner' }],
        steps: [],
      } as unknown as Recipe);
      await firstDeferred.promise;
    });

    const addButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Add',
    ) as HTMLButtonElement;

    expect(addButton.disabled).toBe(false);

    await act(async () => {
      addButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(createMealPlanMock.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        recipe: 2,
        meal_type: 1,
      }),
    );
  });

  it('submits the latest selection if the recipe changes while submit is waiting', async () => {
    const firstDeferred = createDeferred<Recipe>();
    apiGetMock.mockImplementation((path: string) => {
      if (path === '/recipe/1/') return firstDeferred.promise;
      if (path === '/recipe/2/')
        return Promise.resolve({
          id: 2,
          name: 'Porridge',
          servings: 2,
          keywords: [{ name: 'Breakfast' }],
          steps: [],
        } as unknown as Recipe);
      return Promise.reject(new Error(`Unexpected path ${path}`));
    });

    act(() => {
      root.render(
        <AddMealModal
          date="2026-05-30"
          onHide={vi.fn()}
          mealTypes={
            [
              { id: 1, name: 'Breakfast' },
              { id: 2, name: 'Dinner' },
            ] as MealType[]
          }
        />,
      );
    });

    const selectRecipeButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Select recipe',
    ) as HTMLButtonElement;
    const addButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Add',
    ) as HTMLButtonElement;

    asyncTypeaheadState.selected = [{ id: 1, name: 'Curry', servings: 4 } as Recipe];
    await act(async () => {
      selectRecipeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      addButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(createMealPlanMock.mutateAsync).not.toHaveBeenCalled();

    asyncTypeaheadState.selected = [{ id: 2, name: 'Porridge', servings: 2 } as Recipe];
    await act(async () => {
      selectRecipeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      firstDeferred.resolve({
        id: 1,
        name: 'Curry',
        servings: 4,
        keywords: [{ name: 'Dinner' }],
        steps: [],
      } as unknown as Recipe);
      await firstDeferred.promise;
      await Promise.resolve();
    });

    expect(createMealPlanMock.mutateAsync).toHaveBeenCalledTimes(1);
    expect(createMealPlanMock.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        recipe: 2,
        meal_type: 1,
      }),
    );
  });
});
