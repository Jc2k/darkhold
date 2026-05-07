import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RefCallback } from 'react';

const { useDroppableMock } = vi.hoisted(() => ({
  useDroppableMock: vi.fn(),
}));

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core');
  return {
    ...actual,
    useDroppable: useDroppableMock,
  };
});

import { DroppableTableRow } from './MealPlanPage';

describe('DroppableTableRow', () => {
  beforeEach(() => {
    useDroppableMock.mockReset();
    useDroppableMock.mockReturnValue({
      setNodeRef: vi.fn() as RefCallback<HTMLTableRowElement>,
      isOver: false,
    });
  });

  it('adds the drop target class when hovered', () => {
    useDroppableMock.mockReturnValue({
      setNodeRef: vi.fn() as RefCallback<HTMLTableRowElement>,
      isOver: true,
    });

    const markup = renderToStaticMarkup(
      <table>
        <tbody>
          <DroppableTableRow dateKey="2026-05-07" className="base-row">
            <td>Meal</td>
          </DroppableTableRow>
        </tbody>
      </table>,
    );

    expect(markup).toContain('class="base-row meal-plan-row-drop-target"');
  });

  it('leaves the base class unchanged when not hovered', () => {
    const markup = renderToStaticMarkup(
      <table>
        <tbody>
          <DroppableTableRow dateKey="2026-05-07" className="base-row">
            <td>Meal</td>
          </DroppableTableRow>
        </tbody>
      </table>,
    );

    expect(markup).toContain('class="base-row"');
    expect(markup).not.toContain('meal-plan-row-drop-target');
  });
});
