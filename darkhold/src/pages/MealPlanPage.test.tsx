import { act, type RefCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { useDroppableMock } = vi.hoisted(() => ({
  useDroppableMock: vi.fn(),
}));

type ReactActGlobal = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core');
  return {
    ...actual,
    useDroppable: useDroppableMock,
  };
});

import { DroppableTableRow } from './DroppableTableRow';

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
    useDroppableMock.mockReturnValue({
      setNodeRef: vi.fn() as RefCallback<HTMLTableRowElement>,
      isOver: false,
    });
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
