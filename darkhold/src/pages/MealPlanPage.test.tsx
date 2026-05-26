import { act, type RefCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { useDroppableMock, useSensorMock, useSensorsMock } = vi.hoisted(() => ({
  useDroppableMock: vi.fn(),
  useSensorMock: vi.fn(),
  useSensorsMock: vi.fn(),
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

import { MouseSensor, TouchSensor, type Collision } from '@dnd-kit/core';
import { DroppableTableRow } from './DroppableTableRow';
import {
  getEmptyWeekendLunchDates,
  getDateMealTypeCollisionId,
  resolveDropTargetContainerId,
  useMealPlanSensors,
} from './MealPlanPage';

function SensorHarness() {
  useMealPlanSensors();
  return null;
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
});
